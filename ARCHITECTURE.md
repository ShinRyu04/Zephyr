# ZEPHYR — ARCHITECTURE (Kontrak Kanonik)

**Status:** SOURCE OF TRUTH untuk nama `command` Tauri, `event`, bentuk
Zustand store, layout data, dan batas keamanan.
**Aturan:** Jika prompt fase (01–17) menyebut nama yang BERBEDA dari
dokumen ini, **dokumen ini yang menang**. Fase tidak boleh menciptakan
nama command/event baru tanpa menambahkannya ke sini lebih dulu.

Stack: Tauri 2 + React 18 + TS + Vite 6 + Tailwind 3 + CodeMirror 6 +
xterm.js. Backend Rust pegang fs/pty/git/ssh/mcp/settings.

> Tailwind: **v3.4.x** (bukan v4). `postcss.config.js` gaya v3
> (`tailwindcss` + `autoprefixer`), config di `tailwind.config.js`.
> Warna TIDAK didefinisikan di Tailwind — semua token ada di
> `src/styles/theme.css` (`--bg`, `--surface`, `--accent`, `--syn-*`, dst)
> dan diganti per tema lewat `[data-theme="..."]`.

---

## 1. Konvensi penamaan (WAJIB)

- **Tauri command**: `snake_case`, kata kerja/nama domain di depan
  (`fs_read`, `pty_spawn`, `git_status`, `ssh_connect`).
- **Event** (Rust→frontend, `lib/events.ts`): `kebab-case`
  (`pty-output`, `fs-changed`). **Dilarang** pakai titik (`mcp.screenshot`
  → pakai `mcp-screenshot`).
- **MCP JSON-RPC method** (port 9222): `snake_case` — **namespace
  TERPISAH** dari command Tauri. `get_settings`/`set_setting` di MCP
  bukan command Tauri; keduanya hidup di transport berbeda.
- **Store key** (Zustand): `camelCase`.
- Semua IPC frontend lewat `lib/commands.ts` → `invoke`. Komponen tidak
  memanggil `invoke` langsung.

---

## 2. Tauri Commands (final)

### app / settings
| Command | Params → Result |
|---|---|
| `get_app_info` | → { version, identifier, dataDir } |
| `get_settings` | → Settings (semua, tanpa secrets) |
| `set_settings` | { patch: Partial<Settings> } → void |
| `set_window_size` | { width, height } → void |
| `list_recents` | → [{ path, lastOpened }] (max 4) |

### fs / editor
| Command | Params → Result |
|---|---|
| `fs_read` | { path, encoding? } → { content, detectedEncoding, lineEnding } |
| `fs_write` | { path, content, encoding?, lineEnding? } → void |
| `fs_exists` | { path } → bool |
| `fs_stat` | { path } → { size, isDir, mtime } |
| `fs_create_file` | { path, content? } → void |
| `fs_create_dir` | { path } → void |
| `fs_delete` | { paths: string[], recursive } → void |
| `fs_rename` | { from, to } → void |
| `file_dialog_open` | { multiple? } → string[] \| null |
| `file_dialog_save` | { defaultPath? } → string \| null |
| `folder_dialog_open` | → string \| null (picker workspace) |
| `session_load` | → [{ path, encoding }] |
| `session_save` | { tabs: [{path,encoding}] } → void |

### workspace / search
| Command | Params → Result |
|---|---|
| `workspace_open` | { path } → void (emit `workspace-opened`) |
| `workspace_close` | → void (juga menghentikan watcher) |
| `scan_dir` | { path } → DirNode[] — **satu level** (lazy); folder dulu lalu file, alfabetis; depth ≤40 |
| `fs_watch` | { path } → void (emit `fs-changed`, debounce 250ms, rekursif) |
| `fs_unwatch` | → void (stop watcher aktif) |
| `search_files` | { query, glob?, caseSensitive?, regex? } → { hits: SearchHit[] (max 500), filesScanned, truncated } |
| `replace_in_file` | { path, query, replacement, caseSensitive?, regex? } → jumlah penggantian |
| `reveal_path` | { path } → void (Explorer, `/select,` untuk file) |
| `list_workspace_files` | { limit? } → QuickFile[] — Quick Open Ctrl+P (fase 12), aturan ignore sama dengan search, default max 5000 |
| `browser_probe` | { url } → ProbeResult — cek boleh-embed dari header respons (fase 12) |

```ts
interface QuickFile { path; rel; name }                 // rel = relatif root, '/' separator
interface ProbeResult {
  url; reachable; status: number | null;
  embeddable: boolean;      // false → UI tawarkan "Buka di browser eksternal"
  reason: string;           // alasan apa adanya untuk ditampilkan
  header: string | null;    // header yang jadi dasar keputusan
  ms: number;
}
```
`browser_probe` menolak `X-Frame-Options: DENY|SAMEORIGIN|ALLOW-FROM` dan
`CSP frame-ancestors` yang bukan `*`. Header TIDAK bisa dibaca dari dalam
webview, dan event `load` tetap menyala untuk halaman error — jadi keputusan
embed HARUS dari sini, bukan dari timeout di frontend.

```ts
interface DirNode { name; path; isDir; hasChildren }   // hasChildren = tampilkan chevron
interface SearchHit { path; name; line; col; matchLen; preview; before?; after? }
```
Ignore (dipakai `scan_dir`, `search_files`, dan watcher — harus SAMA):
`node_modules .git .venv venv dist build target out .next .cache .turbo
.svelte-kit __pycache__ .pytest_cache`; `*.lock` hanya dilewati saat
pencarian isi (tetap TAMPIL di tree). Pencarian melewati file >2MB dan
file biner (ada byte NUL di 8KB pertama).

### terminal (pty)
| Command | Params → Result |
|---|---|
| `list_shells` | → [{ id, label, path }] — shell yang ADA di mesin (powershell/pwsh/cmd/bash/wsl) |
| `pty_spawn` | { id, kind?, command?, args?, cwd?, cols?, rows? } → pid |
| `pty_write` | { id, data } → void (termasuk `\x03` untuk Ctrl+C) |
| `pty_resize` | { id, cols, rows } → void |
| `pty_kill` | { id } → void |
| `pty_list` | → [{ id, kind, shell, pid, alive }] |
| `pty_set_paused` | { paused } → void (tunda EMIT saat minimized; output tetap dibuffer) |
| `pty_interrupt` | { id } → jumlah proses yang dihentikan (Ctrl+C: `\x03` + kill pohon turunan shell) |
| `list_agents` | → [{ id, label, path, version }] — CLI agent yang ADA di mesin (fase 06) |

`kind`: `'shell' \| 'private' \| 'cmd' \| 'bash' \| 'wsl' \| 'pwsh' \| 'agent' \| 'ssh'`.
Pane `'browser'` tidak punya PTY. **`kind: 'agent'` WAJIB menyertakan
`command`** (dari `settings.agents.startCommands`, fallback path hasil
`list_agents`) — tanpa itu `pty_spawn` menolak, bukan diam-diam jadi shell.

**Private** = PowerShell `-NoProfile` +
`Set-PSReadLineOption -HistorySaveStyle SaveNothing` + env `ZEPHYR_PRIVATE=1`
→ perintahnya tidak ditulis ke `ConsoleHost_history.txt` milik user.
Implementasi PTY: crate **portable-pty 0.8 (ConPTY)** — keputusan final
fase 05, tidak ada fallback pipa.

**Ctrl+C (`pty_interrupt`)** — keputusan fase 05: byte `\x03` saja tidak
menghentikan program yang tidak membaca stdin di ConPTY, dan jalur resmi
`AttachConsole` + `GenerateConsoleCtrlEvent` ikut mematikan proses Zephyr
(sudah diuji, jangan diulang). Yang dipakai: `\x03` ke pty + terminasi
seluruh pohon proses turunan shell (terdalam dulu) via `sysinfo`.

**Clipboard terminal** memakai plugin `tauri-plugin-clipboard-manager`
(`src/lib/clipboard.ts`), BUKAN `navigator.clipboard` — WebView2 menolak
dengan `NotAllowedError: Document is not focused`.

### ssh
**STATUS: DITUNDA (fase 07) — user belum punya hosting untuk diuji.** Fitur
ini menyusul, bukan dibatalkan. Kontrak di bawah tetap berlaku kalau nanti
dikerjakan — jangan pakai nama lain. Pane `kind: 'ssh'` dan ikonnya sudah ada
di store/UI sejak fase 06, jadi implementasinya tinggal mengisi backend.

| Command | Params → Result |
|---|---|
| `ssh_list` | → SshHost[] (tanpa password; hanya `hasPassword`) |
| `ssh_add` | { config } → void |
| `ssh_update` | { config } → void |
| `ssh_delete` | { id } → void |
| `ssh_connect` | { configId } → paneId (emit `ssh-status`) |
| `ssh_disconnect` | { paneId } → void |

### models / ai
| Command | Params → Result |
|---|---|
| `get_public_models` | → [{ provider, hasKey, preview }] — SELALU memuat 6 provider katalog walau `secrets.json` kosong; TIDAK memuat key asli |
| `set_model_key` | { provider, key } → void (key kosong = hapus; Rust-only storage) |
| `test_model_connection` | { provider, baseUrl? } → { ok, message, status, ms } |
| `reset_settings` | → void (hapus settings.json; `secrets.json` TIDAK disentuh) |
| `ai_chat` | { id, provider, model, messages, baseUrl?, maxTokens? } → void; jawaban streaming lewat `ai-chunk` |
| `ai_cancel` | { id } → bool (false = id sudah tidak berjalan) |

**AI (fase 09).** Key dibaca DI RUST (`secrets::key_for`) dan tidak pernah
dikirim dari frontend. Tiga format request ditangani modul terpisah
(`adapters/openai.rs`, `anthropic.rs`, `gemini.rs`): OpenAI-compatible
(`openai`/`deepseek`/`local`/`custom`) memakai `/chat/completions` + SSE,
Anthropic memakai `/v1/messages` + `x-api-key` + `anthropic-version`
(`system` sebagai field terpisah, `max_tokens` wajib), Gemini memakai
`/v1beta/models/<model>:streamGenerateContent` + `x-goog-api-key` dan
membalas **JSON array bertahap**, bukan SSE. `ai_cancel` menyetel flag di
`AppState.ai_reqs`; thread streaming memeriksanya tiap baris.

Catatan `set_settings` (fase 08): patch di-**deep merge**, dan nilai `null`
berarti **hapus key** (RFC 7386). Itulah jalur "reset per item" untuk
`shortcuts[x]` dan `agents.startCommands[x]`. Konsekuensi: tidak ada setting
yang boleh bernilai `null` secara sah.

### git
`git_init {path}`, `git_status`, `git_stage {paths}`, `git_unstage {paths}`,
`git_commit {message}`, `git_push {setUpstream?}`, `git_pull {rebase?}`,
`git_fetch`, `git_branches`, `git_checkout {branch}`,
`git_create_branch {name, from?}`, `git_delete_branch {name}`,
`git_diff {path, staged?}`, `git_discard {paths}`, `git_log {n?}`,
`git_config_get_user`.
Semua git diserialisasi (semaphore 1 proses, `AppState.git_lock`).
`git_push --force` TIDAK ada.

**Implementasi (fase 10, final):** spawn **git CLI**, bukan gix/git2 —
perilakunya identik dengan terminal user dan mendukung credential helper,
rename detection, serta konflik merge tanpa reimplementasi. Status dibaca
`git status --porcelain=v2 --branch --untracked-files=all -z`; record `2 `
(rename) menaruh path lama di record BERIKUTNYA setelah `\0`. Timeout 30s per
perintah, lalu pohon prosesnya dibunuh. `GIT_TERMINAL_PROMPT=0` + `LC_ALL=C`;
di Windows `CREATE_NO_WINDOW` supaya tidak ada jendela konsol berkedip.
`git_status` mengembalikan `isRepo:false` (bukan error) bila folder belum
repo. Untuk file untracked, `git_diff` membuat unified diff sintetis (maks
2000 baris) supaya viewer tetap menampilkan isinya.

### GitHub auth (fase 10)
`gh_status`, `gh_set_pat {token}`, `gh_login_device`, `gh_logout`, `gh_test`.
`gh_refresh` bukan command — dipanggil internal (`github::try_refresh`) saat
push/pull kena 401, lalu operasinya diulang **sekali**.

Pemisahan data:
- `settings.json → git.github { method:"none"|"pat"|"oauth", user, scopes,
  expiresAt, clientId }` — metadata, tidak rahasia.
- `secrets.json → github { token, refresh }` — RAHASIA, Rust-only, tidak
  pernah menyeberang IPC.

Token dipakai lewat subcommand CLI `zephyr git-credential get|store|erase`
(BUKAN command Tauri), disisipkan per-invocation:
`git -c credential.helper= -c credential.helper='!"<exe>" git-credential' …`.
Helper hanya menjawab `host=github.com` + `protocol=https`; host lain dan
`store`/`erase` = NO-OP, sehingga credential manager user (GCM) tetap
menangani sisanya dan `git push` dari terminal biasa tidak berubah perilaku.
Helper juga hanya disisipkan bila remote origin memang github.com HTTPS dan
Zephyr punya token. OAuth memakai **Device Flow** (tanpa client secret) dan
mati bila `clientId` kosong; PAT selalu tersedia.

### extensions
| Command | Params → Result |
|---|---|
| `extensions_list` | → [{ id, name, version, enabled, path }] |
| `extensions_load` | { id } → manifest (validasi ≤1MB, folder whitelist) |

---

## 3. Events (Rust → frontend) — final, `lib/events.ts`

| Event | Payload | Sumber |
|---|---|---|
| `workspace-opened` | { path } | 04 |
| `fs-changed` | { path, dir, kind: 'create'\|'remove'\|'modify' } | 04 |
| `pty-output` | { id, data } (batched 16ms) | 05 |
| `pty-exit` | { id } (proses berakhir sendiri) | 05 |
| `ssh-status` | { paneId, state, message } | 07 |
| `ai-chunk` | { id, text? , err?, done? } | 09 |
| `gh-login` | { state: 'pending'\|'success'\|'error', message? } | 10 |
| `git-progress` | { op, phase } | 10/14 |
| `mcp-action` | { type, payload } | 11 |
| `mcp-screenshot` | { paneId, path } | 11 |
| `mcp-connect` | { client, userAgent } — ada klien menyapa `/health`; `client` hanya label dari UA (bisa dipalsukan), BUKAN auth | 12 |
| `settings-changed` | { key } | 14 |
| `window-resized` | { width, height } | 14 |
| `file-dropped` | { paths } | 03/14 |
| `ram-usage` | { bytes } (tiap 3s, berhenti saat minimized) | 02 |

**Encoding & line ending (fase 03, invariant):**
`detectedEncoding` = `utf8` \| `utf8-bom` \| `ansi` (Windows-1252 fallback);
`lineEnding` = `crlf` \| `lf`. Konten yang dikirim ke frontend SELALU
dinormalkan ke `\n`; saat menulis, Rust mengembalikan line ending asal file
(file baru = `crlf`). BOM ditulis kembali hanya bila file aslinya punya BOM.

---

## 4. MCP JSON-RPC methods (port 9222 — namespace terpisah)

Fitur unggulan, **SELESAI di fase 11**. UI switch-nya dibuat di fase 08 lalu
diganti panel penuh `components/settings/McpPanel.tsx`.

**Read:** `list_panes`, `list_terminals` (alias), `list_editors`,
`get_settings`, `get_setting {key}`, `list_extensions`, `get_window`.
**Write/action:** `terminal_write {paneId,data}`, `terminal_key {paneId,key}`,
`pane_close {paneId}`, `pane_new {type,agent?}`, `editor_open {path}`,
`editor_close {tabId}`, `editor_write {tabId,content}` (buffer saja, bukan
disk), `editor_insert {tabId,text,at?}`, `run_command {id}`,
`screenshot_pane {paneId}`, `set_setting {key,value}` (whitelist).
**Meta:** `GET /health` (tanpa auth), `GET /mcp` (schema 18 tool),
`tools/list`, `ping`.
Auth: `Authorization: Bearer <token>`; bind HANYA 127.0.0.1.

**Implementasi (fase 11, final):**
- `mcp_server.rs` — axum 0.8 di atas runtime tokio Tauri. Route `POST /`
  (juga `/rpc`), `GET /health`, `GET /mcp`. Batch JSON-RPC (array) dilayani.
- Port: `settings.mcp.port` lalu **5 kandidat** (9222..9226). 9223 di mesin
  dev dipakai debug port WebView2, jadi satu fallback tidak cukup. Port hasil
  bind ditulis ke `settings.mcp.port` + `mcp.json`, dan `McpRuntime.requested`
  menyimpan port asli untuk banner UI.
- Yang bisa dijawab Rust dijawab di Rust (settings, PTY write/key lewat
  registry `AppState.with_pty` — teks masuk shell walau window tidak fokus).
  Yang butuh zustand dikirim ke frontend: event `mcp-action`
  `{reqId,type,payload}` → frontend menjawab command **`mcp_reply
  {reqId,result}`**; Rust menunggu oneshot maks **8 detik**.
- Serialisasi: setiap method mengambil `AppState.mcp_lock`
  (`tokio::sync::Mutex`) → dua AI CLI yang mengemudi bersamaan diproses satu
  per satu.
- `screenshot_pane` v1 menulis **isi buffer terminal sebagai .txt** di `%TEMP%`
  lalu emit `mcp-screenshot`. Capture PNG jendela = fase 16; jangan mengaku
  PNG untuk file teks.
- `set_setting` whitelist 10 key tampilan/editor. `mcp.*`, `git.github.*`,
  dan path DITOLAK — agent tidak boleh mematikan auth-nya sendiri.
  `get_settings` memask `mcp.token` → `"***"` dan membuang `git.github`.

### Command Tauri MCP (fase 11)
| Command | Params → Result |
|---|---|
| `mcp_status` | → { running, port, requestedPort, token, uptimeMs, enabled } |
| `mcp_start` | → port yang dipakai (set `mcp.enabled=true` dulu) |
| `mcp_stop` | → bool (socket ditutup, port berhenti listening) |
| `mcp_reply` | { reqId, result } → bool |
| `mcp_rotate_token` | → token baru |
| `mcp_write_cli` | { ids } → CliWriteResult[] (backup .bak, merge JSON/TOML) |
| `mcp_remove_cli` | { ids } → CliWriteResult[] |
| `mcp_cli_status` | → [{ id, label, path, exists, registered }] |

Target config CLI (`mcp_config.rs`): `.claude.json`, `.codex/config.toml`
(TOML), `.gemini/settings.json`, `.config/opencode/opencode.json` (key `mcp`),
`.copilot/mcp-config.json`, `.cursor/mcp.json`, `Startup/.mcp.json`.
Entri: `{"zephyr":{type:"http",url,headers:{Authorization}}}`; JSON di-parse &
di-merge (key lain utuh), file lama selalu disalin ke `<nama>.bak`.

### Command Palette & Quick Open (fase 12)

`lib/commandRegistry.ts` = SATU sumber daftar action (`COMMANDS`, 40 entri:
File / Editor / View / Terminal / Git / AI / MCP / Settings / Help). Setiap
entri `{ id, title, group, keywords?, action?, enabled?, run }`; `action`
menautkannya ke binding di `shortcuts.ts`, `enabled()` menyembunyikan command
yang tidak relevan (mis. `git.commit` hanya saat workspace = repo).

`lib/paletteStore.ts` memegang modal dua-mode: `command` (Ctrl+Shift+P) dan
`file` (Ctrl+P, dari `list_workspace_files`). Skor fuzzy: prefix > kata >
substring > subsequence, dengan bonus recent (10 terakhir). Daftar hasil
dihitung lewat `items()`, BUKAN selector zustand (selector yang membuat array
baru memicu update tak berujung — pelajaran fase 09).

Shortcut yang wajib ada & bebas konflik: `Ctrl+Shift+P` `Ctrl+P`
`Ctrl+Shift+E` `Ctrl+Shift+F` `Ctrl+Shift+G` `Ctrl+Shift+T` `Ctrl+\``
`Ctrl+N` `Ctrl+O` `Ctrl+S` `Ctrl+W` `Ctrl+Tab` `Ctrl+B` `Ctrl+J` `Ctrl+=`
`Ctrl+-` `Ctrl+0`.

---

## 5. Zustand Store (final shape)

```ts
interface Store {
  workspace: string | null
  tabs: Tab[]
  activeTabId: string | null
  terminalTabs: TerminalTab[]
  settings: Settings
  ai: { model: string; messages: Msg[] }
  mcp: { enabled: boolean; running: boolean; port: number }
}
interface Tab { id; path: string|null; name; encoding; lineEnding; unsaved; content; lang }
interface TerminalTab { id; title; panes: PaneMeta[]; layout: 'grid'|'split'; activePaneId: string|null }
interface PaneMeta { id; kind:'shell'|'private'|'cmd'|'bash'|'wsl'|'pwsh'|'agent'|'ssh'|'browser';
  agent?: {name,label}; title; sessionId?; status:'live'|'exited'|'connecting'|'error';
  cwd; pid?; url? }   // url hanya untuk kind 'browser' (iframe)
interface Settings {   // = settings.json
  general:{theme,fontFamily,fontSize,lineHeight,uiLang,zoom,restoreSession,checkUpdates}
  editor:{tabSize,insertSpaces,wordWrap,minimap,cursorStyle,smoothScroll,formatOnSave}
  theme:{current,accent?}
  shortcuts:Record<actionId,string>
  models:{activeProvider,providers:{[p]:{baseUrl,model}}}   // apiKey TIDAK di sini
  agents:{maxPanes,order,startCommands:{[a]:string[]},attachActiveFile}
  extensions:{enabled:string[]}
  git:{userName?,userEmail?,defaultBranch,pullBeforePush}
  mcp:{enabled,port,token,writeToCli:string[]}
  ssh:{recentHosts?:string[]}
}
```
Persist (store plugin): `settings`, `recentWorkspaces`, `layout`,
`mcp.enabled`. **`ai.apiKeys` TIDAK persist di frontend** — hanya di
`secrets.json` via Rust.

**Store kedua (fase 04): `lib/explorerStore.ts` — `useExplorer`.**
Dipisah agar store editor tetap ramping; keduanya saling memanggil lewat
import langsung, bukan lewat komponen.
```ts
interface ExplorerStore {
  children: Record<string, DirNode[]>   // isi per folder (lazy, key = path)
  expanded: Record<string, boolean>
  selected: string[]; anchor: string | null   // multi-select Ctrl/Shift
  ctxMenu: { x, y, path, isDir } | null
  inlineEdit: { kind:'new-file'|'new-folder'|'rename'; target; initial } | null
  explorerError: string | null
  // search
  query; glob; caseSensitive; regex; replaceWith
  searching: boolean; hits: SearchHit[]; filesScanned; truncated
  searchError: string | null
}
```
`useStore` menyediakan jembatan yang dipakai Explorer: `openWorkspace`,
`closeWorkspace`, `refreshRecents`, `recents`, `openPathAt(path,line,col)`,
`renamePathInTabs`, `closeTabsUnder`, `reloadTabFromDisk`.

---

## 6. Layout data user — `%APPDATA%\zephyr\`

```
settings.json   (Settings, tanpa secret)
secrets.json    (API keys — akses Rust-only, mask ke frontend)
recent.json     (recent workspaces)
session.json    (restore tabs)
mcp.json        (config MCP + token)
ssh.json        (host SSH; password terenkripsi opsional, bukan plaintext)
extensions/     (folder paket ekstensi)
logs/           (zephyr-YYYY-MM-DD.log, rotate 2MB)
```

---

## 7. Batas keamanan (invariant lintas fase)

1. **Path**: operasi tulis wajib `canonicalize` & cek masih dalam
   workspace → `WorkspaceOutside` jika keluar (dialog picker = whitelist).
2. **Secret**: API key tidak pernah ke frontend utuh; hanya `hasKey` +
   mask `sk-…ab`. Tidak ditulis ke log.
3. **MCP**: bind 127.0.0.1 saja + Bearer token; `editor_write` = buffer,
   bukan disk; dua agent diserialisasi (mutex AppState).
4. **Git**: `push --force` tidak tersedia; discard/delete branch butuh
   konfirmasi; delete branch current ditolak.
5. **Error**: semua command `Result<T, ZephyrError>`; frontend terima
   `{ code, message }`. Tidak ada `unwrap()` di jalur input user.

---

## 8. ZephyrError (enum, fase 14)
`NotFound | InvalidInput | Permission | WorkspaceOutside | Git | Pty |
Ssh | Mcp | Encoding | Io | Internal` → Display → `tauri::Error`.

---
_Dokumen ini diringkas dari prompt fase 01–14. Update di sini dulu, baru
prompt fase disesuaikan._