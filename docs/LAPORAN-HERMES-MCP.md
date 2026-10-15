# LAPORAN — Jalur Hermes → Zephyr (MCP 9222), keadaan 2026-10-15

Bukti di bawah ini dijalankan sendiri oleh agen induk (bukan klaim subagent),
lewat HTTP langsung ke server MCP Zephyr di `http://127.0.0.1:9222/`.

## 1. Transport & otentikasi

| Uji | Hasil |
|---|---|
| `POST /` tanpa token | HTTP **401** `{"error":"Bearer token is wrong or missing"}` |
| `GET /` | HTTP **405** (endpoint JSON-RPC, GET tidak dilayani) |
| `initialize` dengan token | HTTP **200**, `serverInfo {name: "zephyr", version: "1.1.13"}`, `protocolVersion "2024-11-05"` |

Token dibaca langsung dari `%APPDATA%\zephyr\mcp.json` (64 karakter). Token tidak
pernah dicetak di laporan mana pun.

## 2. Daftar tool (`tools/list`)

HTTP 200 — **20 tool** terdaftar:

```
list_panes, list_terminals, list_editors, get_window, list_extensions,
get_settings, get_setting, set_setting, terminal_write, terminal_key,
pane_new, pane_close, editor_open, editor_close, editor_write, editor_insert,
run_command, screenshot_pane, get_problems, get_output
```

Catatan dari server sendiri:
- `editor_write` & `editor_insert` **HANYA mengubah buffer tab, TIDAK menulis ke disk**.
- `editor_write` wajib `tabId` + `content`; `run_command` wajib `id`.
- **All methods are serialized.**

## 3. `get_settings` (isi asli)

```
mcp.enabled = true
mcp.port = 9222
mcp.allow_terminal_control = false
mcp.token = '***'
mcp.writeToCli = hermes, claude, codex, opencode, copilot
allowlistWeb = 5 host
```

## 4. Akar "nol panes" — SELESAI 2026-10-15

**Sebelum:** `get_window` → `{workspace: null, title: "Zephyr", activeTabId: null,
focusedPaneId: null, layout.tab: "subagents"}`. `list_panes` = `[]`,
`list_editors` = `[]`. Setiap `editor_open` ditolak `mcp: path outside the workspace`
— **bahkan untuk path di dalam `D:/Zephyr`** — karena app tidak membuka folder apa pun.

**Perbaikan (tanpa dialog folder-picker):** dibuka lewat **jalur app sendiri**,
bukan `run_command`/`explorer.openFolder`:

```js
// CDP 9223
window.__ZEPHYR__.getState().openWorkspace('D:/Zephyr')
// store.ts:648 -> cmd.workspaceOpen -> invoke Rust 'workspace_open' (tanpa dialog)
```

**Sesudah (diverifikasi lewat MCP 9222):**

| Uji | Hasil |
|---|---|
| `get_window.workspace` | `"D:/Zephyr"` (aktivitas `explorer`, sidebar & terminal terlihat) |
| `editor_open` `D:/Zephyr/README.md` | **SUKSES** `{"lang":"markdown","name":"README.md","path":"D:/Zephyr/README.md","tabId":"t1"}` |
| `editor_open` `C:/Windows/win.ini` (kontrol negatif) | **DITOLAK** `mcp: path outside the workspace: C:/Windows/win.ini` |

Jadi pagar workspace tidak ikut kendor: di dalam → boleh, di luar → tolak.

## 5. Sisa yang butuh keputusan pemilik

`mcp.allow_terminal_control` masih `false` → `terminal_write` / `terminal_key`
ditolak dengan pesan `permission denied: terminal control is disabled for MCP;
enable mcp.allow_terminal_control in Settings explicitly` (sesuai `mcp_server.rs:524-527`).
Mengubahnya adalah keputusan keamanan pemilik, bukan bug — belum disentuh.

## 6. Cara membalikkan mutasi

`openWorkspace` mengubah state app (membuka folder). Untuk kembali:
`__ZEPHYR__.getState().closeWorkspace()` atau tutup folder dari UI.

## Skrip uji (scratch)

`uji-mcp-zeph.cjs`, `uji-mcp-rantai.cjs`, `uji-mcp-dalam.cjs`, `uji-mcp-window.cjs`,
`uji-mcp-tools.cjs`, `uji-mcp-ws.cjs`, `eval-buka-workspace.js` — semua di
`C:\Users\Zyrex\AppData\Local\hermes\cache\scratch\`.
