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
| `ai_chat` | { provider, model, messages, maxTokens? } → stream via `ai-chunk` |

Catatan `set_settings` (fase 08): patch di-**deep merge**, dan nilai `null`
berarti **hapus key** (RFC 7386). Itulah jalur "reset per item" untuk
`shortcuts[x]` dan `agents.startCommands[x]`. Konsekuensi: tidak ada setting
yang boleh bernilai `null` secara sah.

### git
`git_init {path}`, `git_status`, `git_stage {paths}`, `git_unstage {paths}`,
`git_commit {message}`, `git_push`, `git_pull {rebase?}`, `git_fetch`,
`git_branches`, `git_checkout {branch}`, `git_create_branch {name, from?}`,
`git_delete_branch {name}`, `git_diff {path, staged?}`, `git_discard {paths}`,
`git_log {n?}`, `git_config_get_user`.
Semua git diserialisasi (semaphore 1 proses). `git_push --force` TIDAK ada.

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
| `git-progress` | { op, phase } | 10/14 |
| `mcp-action` | { type, payload } | 11 |
| `mcp-screenshot` | { paneId, path } | 11 |
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

Fitur unggulan, DIKERJAKAN di fase 11. UI switch-nya sudah dibuat di fase 08.

**Read:** `list_panes`, `list_editors`, `list_terminals`, `get_settings`,
`get_setting {key}`, `list_extensions`, `get_window`.
**Write/action:** `terminal_write {paneId,data}`, `terminal_key {paneId,key}`,
`pane_close {paneId}`, `pane_new {type,agent?,title?}`, `editor_open {path}`,
`editor_close {tabId}`, `editor_write {tabId,content}` (buffer saja, bukan
disk), `editor_insert {tabId,text,at?}`, `run_command {id}`,
`screenshot_pane {paneId}`, `set_setting {key,value}` (whitelist).
**Meta:** `GET /health` (tanpa auth), `GET /mcp` (schema tools).
Auth: `Authorization: Bearer <token>`; hanya 127.0.0.1.

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