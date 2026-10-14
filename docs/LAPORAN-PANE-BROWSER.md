# LAPORAN — PAGAR PANE BROWSER (item ZEPH-BROWSER-BUILTIN)

Status: **usulan + bukti harness** (kode produk READ-ONLY; tidak ada berkas produk yang diubah).
Tanggal bukti: 2026-10-14. Branch: `feat/ai-panel-vscode-layout`.

Harness: `scripts/uji-pane-browser.mjs` — **19 kasus, 19/19 LULUS, exit 0**.
Usulan patch: `docs/USULAN-PANE-BROWSER.md` (merujuk `docs/USULAN-BROWSER-DAN-FETCH.md`, tidak menduplikasi).

---

## 1. Ringkasan temuan

Pane browser bawaan **sudah ada** (`src-tauri/src/browser_pane.rs`, dipakai oleh 11 tool di
`src/lib/zephyrTools/web.ts`). Yang **belum ada** adalah pagarnya: pane menerima URL apa pun yang
berawalan `http://`/`https://` tanpa allowlist, dan tidak memakai lantai jaringan
`validate_outbound_url` yang sudah ada untuk jalur fetch. Selain itu ada satu jalur yang bisa
menulis berkas lokal tanpa gerbang (`browser_download_url`).

**6 celah kode produk** terkonfirmasi terhadap berkas nyata (berkas + baris di §3). Angka batas
yang diusulkan: byte bawa **2.097.152** (2 MiB), byte maks **8.388.608** (8 MiB), hop redirect **5**.

---

## 2. Hasil nyata (keluaran verbatim)

### Perintah 1 — harness pagar pane

```
$ node scripts/uji-pane-browser.mjs ; echo "EXIT=$?"

== (A) Bukti aturan pagar pane (implementasi acuan, node-only) ==

LULUS  C01 allowlist default-tolak (host tak terdaftar)
       host-luar-allowlist:jahat.com
LULUS  C02 subdomain tipu ditolak (contoh.com.jahat.com)
       host-luar-allowlist:contoh.com.jahat.com
LULUS  C03 skema file:// ditolak
       skema-terlarang:file:
LULUS  C04 skema javascript: ditolak
       skema-terlarang:javascript:
LULUS  C05 skema data: ditolak
       skema-terlarang:data:
LULUS  C06 skema about: ditolak
       skema-terlarang:about:
LULUS  C07 IP link-local 169.254.169.254 ditolak walau ADA di allowlist
       ip-privat:169.254.169.254
LULUS  C08 IP loopback 127.0.0.1 ditolak walau ADA di allowlist
       ip-privat:127.0.0.1
LULUS  C09 IP privat 10.0.0.5 ditolak walau ADA di allowlist
       ip-privat:10.0.0.5
LULUS  C10 port tak lazim ditolak/ditandai (contoh.com:31337)
       port-tak-lazim:31337
LULUS  C11 redirect per-hop: hop ke host luar allowlist ditolak
       hop-1:host-luar-allowlist:jahat.com
LULUS  C12 daftar aksi tak memuat terminal/hapus berkas/berkas lokal mentah
       bocor=[]
LULUS  C13 tanpa argumen ditolak
       tanpa-argumen | tanpa-argumen | tanpa-argumen
LULUS  C14 penolakan SEBELUM webview/socket (penghitung 0)
       buruk webview=0 socket=0; sah webview=1 socket=1
LULUS  C15 batas ukuran: bodi > BATAS_BYTE_MAKS ditolak (angka 8388608)
       bodi-terlalu-besar:8388609>8388608; clamp-batas=8388608
LULUS  C16 batas redirect: rantai > BATAS_HOP_REDIRECT ditolak (angka 5 hop)
       batas-redirect-terlampaui:6
LULUS  C17 kontrol-positif: host allowlisted diterima
       https://contoh.com/halaman | https://docs.contoh.com/v
LULUS  C18 trik userinfo (user@host) ditolak
       host-luar-allowlist:jahat.com
LULUS  C19 jaringan nyata tetap 0 setelah seluruh uji
       {"fetch":0,"websocket":0,"net":0,"http":0,"dns":0}

LULUS 19/19

== (B) Jarak ke kode produk (berkas + baris nyata, bukan lulus/gagal) ==
ADA  src-tauri/src/web.rs:18 — lantai jaringan tunggal ADA (pub fn validate_outbound_url)
ADA  src-tauri/src/web.rs:27 — lantai skema http/https ADA
ADA  src-tauri/src/web.rs:41 — lantai port 80/443 ADA
ADA  src-tauri/src/web.rs:48 — blokir loopback/privat/link-local ADA
ADA  src-tauri/src/web.rs:123 — redirect TIDAK diikuti (max_redirects 0) ADA
CELAH src-tauri/src/web.rs:142 — CELAH: bodi dibaca TANPA batas BYTE (read_to_string) — patch U3
CELAH src-tauri/src/web.rs — CELAH: web_fetch tanpa allowlist domain — patch U1/U6
ADA  src-tauri/src/browser_pane.rs:55 — pane hanya menerima http/https (cek awalan) ADA
CELAH src-tauri/src/browser_pane.rs — CELAH: browser_pane_open/nav TIDAK memanggil validate_outbound_url (tanpa lantai jaringan)
CELAH src-tauri/src/browser_pane.rs — CELAH: browser_pane_open/nav tanpa allowlist domain — patch U4/U5
CELAH src-tauri/src/browser_pane.rs:244 — CELAH: browser_pane_eval menjalankan JS bebas -> bisa location.href = ... (BUTUH APP: event navigasi webview)
ADA  src-tauri/src/browser_pane.rs:331 — baca elemen terbatas (cursor) ADA
CELAH src/lib/zephyrTools/web.ts:349 — CELAH: spec web_fetch tanpa param allowlist domain — patch U1
TANDAI src/lib/zephyrTools/web.ts — TANDAI: aksi pane nyata = [web_search, web_fetch, browser_open, browser_read, browser_click, browser_type, browser_nav, browser_list, browser_close, browser_download_url, system_browser_open] — perlu-review-gerbang-berkas: [browser_download_url]

== Ringkasan ==
kasus pagar pane : 19/19 LULUS
jaringan nyata   : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)
celah kode produk: 6 (lihat bagian B + docs/USULAN-PANE-BROWSER.md)
ANGKA BATAS      : byte-bawa=2097152  byte-maks=8388608  hop-redirect=5  halaman-redirect=5  port-sah=default,80,443
HASIL: aturan PAGAR PANE LULUS (exit 0). Ini TIDAK berarti kode produk sudah aman — celah di bagian (B) menunggu patch.
```

Exit code: **0**.

### Perintah 2 — harness rencana (tidak diubah, harus tetap 27/27)

```
$ node scripts/uji-fetch-web-rencana.mjs
...
LULUS 27/27
```

Exit code: **0**. Berkas `scripts/uji-fetch-web-rencana.mjs` **tidak disentuh**.

### Perintah 3 — typecheck

```
$ npx tsc --noEmit ; echo "EXIT=$?"
EXIT=0
```
**0 galat** (tanpa keluaran diagnostik).

### Kenapa "jaringan nyata 0" bermakna

Harness mem-patch `globalThis.fetch`, `globalThis.WebSocket`, `net.Socket.prototype.connect`,
`net.connect`, `net.createConnection`, `http.request/get`, `https.request/get`, dan `dns.lookup`
**sebelum** kasus apa pun jalan. Tiap panggilan menaikkan penghitung lalu **melempar**. C19 lulus
(0/0/0/0/0) membuktikan kebijakan acuan menolak URL di luar allowlist **sebelum** transport, dan C14
membuktikan penghitung webview/socket tetap **0** untuk semua URL buruk sementara kontrol positif
(`https://contoh.com/ok`) tepat **1**.

---

## 3. Titik sambung yang ADA (berkas + baris nyata)

Angka di bawah diverifikasi langsung dari berkas pada 2026-10-14 (bukan dari catatan lama).

| Berkas | Baris | Isi | Peran untuk pagar |
|---|---|---|---|
| `src-tauri/src/web.rs` | 18 | `pub fn validate_outbound_url` | **Lantai jaringan tunggal** — skema, port, IP privat, resolusi DNS |
| `src-tauri/src/web.rs` | 27 | cek skema `http`/`https` | Lantai skema |
| `src-tauri/src/web.rs` | 41 | cek `port != 80 && port != 443` | Lantai port (acuan angka port di usulan) |
| `src-tauri/src/web.rs` | 48 | blokir loopback / privat / link-local | Lantai IP |
| `src-tauri/src/web.rs` | 123 | `max_redirects(0)` | Redirect tidak diikuti di jalur fetch |
| `src-tauri/src/web.rs` | 142 | `read_to_string()` | **Celah**: bodi tanpa batas byte |
| `src-tauri/src/browser_pane.rs` | 52–57 | cek awalan `http://`/`https://` | Satu-satunya pagar pane saat ini |
| `src-tauri/src/browser_pane.rs` | 212–218 | nav `goto` (parse + `w.navigate`) | **Celah**: tanpa allowlist |
| `src-tauri/src/browser_pane.rs` | 244 | `browser_pane_eval` (jalankan JS) | **Celah**: bisa `location.href = …` |
| `src-tauri/src/browser_pane.rs` | 331 | `browser_pane_cursor` (baca elemen, `slice(0,60)`) | Pembatas ukuran baca yang sudah ada |
| `src/lib/zephyrTools/web.ts` | 349 | spec `web_fetch` | **Celah**: tanpa param allowlist |
| `src/lib/zephyrTools/web.ts` | 360–371 | run `web_fetch` | **Celah**: tanpa gerbang sebelum `cmd.webFetch` |
| `src/lib/zephyrTools/web.ts` | 376–391 | spec `browser_open` | Aksi pane yang dipaparkan ke model |
| `src/lib/zephyrTools/web.ts` | 506–523 | `browser_read` | Aksi baca-teks |
| `src/lib/zephyrTools/web.ts` | 525–558 | `browser_click` (via `evalPane`) | Aksi klik — jalan pintas eval |
| `src/lib/zephyrTools/web.ts` | 561–593 | `browser_type` (via `evalPane`) | Aksi isi — jalan pintas eval |
| `src/lib/zephyrTools/web.ts` | 596–664 | `browser_nav` | Aksi gulir/nav |
| `src/lib/zephyrTools/web.ts` | 707–731 | `browser_download_url` | **Celah**: tulis berkas lokal tanpa `periksaTulis` |
| `src-tauri/src/browser.rs` | 9 / 44 | batas unduhan 100 MB / redirect tidak diikuti | Acuan angka unduhan |

**Daftar aksi pane yang dipaparkan ke model** (dari `web.ts`, terverifikasi):
`web_search, web_fetch, browser_open, browser_read, browser_click, browser_type, browser_nav,
browser_list, browser_close, browser_download_url, system_browser_open`.
Tidak ada nama yang memuat terminal/shell/exec/hapus-berkas/readfile (dicek C12 → `bocor=[]`).

---

## 4. TERBUKTI tanpa app vs BUTUH APP

### TERBUKTI tanpa app (node-only, sudah dijalankan)
- Aturan pagar acuan: allowlist default-tolak, subdomain tipu, skema non-http(s), IP privat/
  link-local, port tak lazim, redirect per-hop, daftar aksi bersih, tanpa argumen ditolak,
  penolakan **sebelum** transport (C01–C19, 19/19).
- **Kehadiran** titik sambung di kode produk + nomor barisnya (§3) — dibaca langsung dari berkas.
- **Bentuk** spesifikasi/usulan patch (teks lama/baru) di `docs/USULAN-PANE-BROWSER.md`.
- `npx tsc --noEmit` = 0 galat; `scripts/uji-fetch-web-rencana.mjs` = 27/27.

### BUTUH APP (tidak bisa dibuktikan tanpa app hidup)
- Bahwa `validate_outbound_url` benar-benar dipanggil & menolak di jalur **runtime** pane
  (`browser_pane_open`/`nav`) — ini Rust di dalam Tauri.
- Batas byte runtime di `web.rs` (patch U3) — harness node tidak menjalankan Rust.
- **Escape navigasi via `browser_pane_eval`** (C5): `browser_click`/`browser_type`/`browser_nav`
  mengirim JS ke `browser_pane_eval`, dan JS itu bisa `location.href = '…'`. Menegakkan pagar di
  sini **butuh menangkap event navigasi webview** (`on_navigation`), bukan regex — BUTUH APP.
- Bentuk UI allowlist di Settings §security.
- Batas unduhan/berkas `browser_download_url` saat runtime menulis ke disk.

---

## 5. Celah kode produk (6, terkonfirmasi)

1. **`web.rs:142`** — bodi `read_to_string` tanpa batas byte → satu URL besar mengisi RAM. (usulan U3)
2. **`web.rs`** — `web_fetch` tanpa allowlist domain. (usulan U1/U6)
3. **`browser_pane.rs:52–57`** — pane hanya cek awalan `http(s)://`; tidak memanggil
   `validate_outbound_url` → tanpa lantai jaringan. (usulan U4/U5)
4. **`browser_pane.rs:212–218`** — `browser_pane_nav` (`goto`) tanpa allowlist. (usulan U5)
5. **`browser_pane.rs:244`** — `browser_pane_eval` menjalankan JS bebas → `location.href = …`
   melewati semua gerbang `open`/`nav`. **BUTUH APP.** (usulan U9)
6. **`web.ts:707–731`** — `browser_download_url` menulis berkas lokal lewat `cmd.fsWrite` dengan
   `destination_path` dari model, **tanpa** `periksaTulis` (agentGuard) dan tanpa allowlist domain.
   (usulan U8)

---

## 6. Utang / sisa (apa adanya)

- U3, U4, U5, U8(Rust bagian), U9 **BUTUH APP** untuk diuji runtime.
- Harness membuktikan **aturan acuan**, bukan penegakan di kode produk.
- Bentuk persistensi allowlist (config vs state) belum diputuskan — tidak dikarang.
- Tidak ada berkas produk yang di-`git add`/commit; hanya dokumen + harness baru.
