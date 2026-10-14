# SPIKE 150 — Pane BROWSER bawaan + otomasi

Status: **rancangan (read-only)**. Semua klaim di bawah hasil baca berkas nyata; nomor baris
disebutkan supaya bisa diperiksa ulang. Tidak ada kode yang diubah untuk dokumen ini.

Klarifikasi klaim lama: konteks menyebut "pane browser bawaan" **belum ada**. Setelah dibaca,
**pane-nya SUDAH ADA dan terpakai**; yang masih BOLONG adalah sisi **otomasi selektor** untuk agen.
Dokumen ini merancang penutup celah itu, bukan membangun pane dari nol.

---

## 1. Yang sudah ADA (bisa dipakai ulang)

Backend pane (Rust) — `src-tauri/src/browser_pane.rs`:
- `browser_pane_open` (baris 43) — bikin child webview WebView2 per pane; menolak URL non-`http(s)`;
  ada kunci per-pane (`KUNCI`, baris 22) supaya StrictMode/dev tidak bikin webview dobel.
- `browser_pane_bounds` (149), `browser_pane_visible` (171), `browser_pane_close` (183).
- `browser_pane_nav` (197), `browser_pane_eval` (244) — **eval JS di dalam halaman** (inilah pondasi otomasi),
  `browser_pane_info` (286) → `PaneInfo { pane_id, label, url, title }` (struktur ~baris 35),
  `browser_pane_cursor` (331) — hanya mengembalikan **x,y** (bukan selektor).

Backend probe — `src-tauri/src/browser.rs`:
- `browser_download_url` (21), `browser_probe` (109) — baca header `X-Frame-Options`/CSP lewat `ureq`
  untuk memutuskan halaman bisa di-embed; **screenshot sengaja tidak didukung**.

Jembatan front-end — `src/lib/commands.ts`:
- `browserPaneOpen` (1371), `browserPaneBounds` (1380), `browserPaneVisible` (1388),
  `browserPaneClose` (1391), `browserPaneNav` (1394), `browserPaneEval` (1397),
  `browserPaneInfo` (1400), `browserPaneCursor` (1423).

Tool AI (subbagian otomasi sudah ada) — `src/lib/zephyrTools/web.ts`:
- `browser_open` (376), `browser_read` (508), `browser_click` (527), `browser_type` (563),
  `browser_nav` (598), `browser_list` (669), `system_browser_open` (735).
- `browser_click` (527-560) & `browser_type` (563-596) **sudah** menjalankan skrip `document.querySelector(...)`
  di dalam halaman via `evalPane` — jadi jalur "eval di halaman" sudah terbukti, bukan asumsi.
- `open_preview` (localhost-only) di `src/lib/zephyrTools/builtins.ts` (2057).

Penyaring & katalog:
- `src/lib/subsetAlat.ts`: `AWALAN_WEB = ['browser_']` (baris 40), `NAMA_WEB = ['system_browser_open','web_fetch','web_search']` (41),
  `KATA_WEB` (56-63), `alatUntukTugas` (181) — tool web hanya ikut saat tugas menyebut jaringan.
- Katalog blok WEB (`src/lib/zephyrTools/catalog.ts` baris 219-230): 11 entri = 8 tool `browser_*`
  + `system_browser_open` + `web_search`/`web_fetch`; grup web dibatasi `WEB_MATI` (baris 343-348, mati sebagai default).

Izin Tauri — `src-tauri/capabilities/default.json`: sudah ada `core:webview:default`,
`core:webview:allow-create-webview-window`, `core:window:allow-create`. **Tidak perlu izin baru** untuk pane.

---

## 2. Yang KURANG (tepatnya)

1. **Tidak ada "element picker" yang mengembalikan SELEKTOR.** `browser_pane_cursor` (browser_pane.rs:331)
   hanya memberi koordinat x,y. Agen tidak punya cara mengubah "titik yang user tunjuk" menjadi aksi;
   ia harus menebak selektor sendiri lewat `browser_read`.
2. **Tidak ada tangkapan piksel.** `browser.rs` sengaja menolak screenshot (komentar ~baris 88-90);
   akibatnya agen tidak bisa "melihat" render — hanya membaca DOM. Ini keterbatasan sadar, dicatat sebagai risiko.
3. **Tidak ada baca console/network.** Tidak ada tool untuk log konsol atau daftar request halaman,
   jadi debugging "kenapa klik tidak bekerja" tidak punya bukti dari sisi halaman.
4. Grup web mati secara default (`WEB_MATI`) — loop otomasi hanya hidup bila tugasnya diklasifikasi
   "butuh web" oleh `KATA_WEB` (subsetAlat.ts:56-63). Untuk tugas campuran, 9 tool browser muncul/lenyap.

---

## 3. Rancangan teknis minimal

Sasaran langkah ini: **tutup celah selektor tanpa menambah perintah Rust dan tanpa izin baru.**
Semua memakai `browser_pane_eval` yang sudah ada.

- **Berkas baru**: tidak ada (step-1 menyentuh 1 berkas yang sudah ada).
- **Perintah Rust baru**: **tidak perlu.** `browser_pane_eval` + `browser_pane_cursor` cukup.
- **Tool AI baru**: `browser_pick` (nama final bebas, usul `browser_pick`) —
  parameter `{ x: number, y: number }` → mengembalikan selektor CSS stabil untuk elemen di titik itu.
  Implementasi = string JS yang di-eval lewat `evalPane` (pola `browser_click`, web.ts:539-556):
  `document.elementFromPoint(x,y)` lalu bangun selektor dari `id` → `[data-testid]` → `name` →
  path `tag:nth-of-type(n)` sampai akar. Kembalikan `null` bila tidak ada elemen.
- **Bentuk data** (usul): `{ selector: string | null, tag: string, text: string (<=80 char) }`
  supaya agen bisa memverifikasi selektor sebelum mengklik.
- **Perubahan katalog**: tambah 1 entri WEB. Ini menaikkan katalog WEB, jadi **wajib dicek ulang**
  terhadap langit-langit "<= 20 tool per giliran" (lihat `scripts/audit-katalog-tool.mjs` §C).
  `browser_pick` tetap ikut aturan grup web yang sudah ada (`AWALAN_WEB` sudah mencakup `browser_`), jadi
  ia **tidak** muncul pada tugas non-web — aman terhadap anggaran per giliran.
- **Izin**: tidak ada izin webview baru (memakai `browser_pane_eval` yang sudah diizinkan).

Opsional (fase berikutnya, hanya bila benar-benar dibutuhkan):
- `browser_console` — baca `console.*` terakhir. Butuh penyuntikan shim saat `browser_pane_open`, bukan izin baru.
- Screenshot — butuh fitur WebView2 `CapturePreview`; **ini perubahan izin/permukaan baru**, pisahkan dari step-1.

---

## 4. Risiko + hal yang butuh webview/izin baru

- **Selektor tidak stabil.** Situs SPA mengganti DOM; selektor hasil pick bisa basi dalam hitungan detik.
  Mitigasi: kembalikan juga `text`/`tag` agar agen bisa memvalidasi ulang; jangan simpan selektor lintas navigasi.
- **`elementFromPoint` dan pane tersembunyi.** Eval gagal bila pane tidak ter-render di layar
  (sudah dicatat di komentar web.ts:147-183). `browser_pick` harus memulangkan galat yang jelas, bukan `null` palsu.
- **Keamanan.** `browser_pane_eval` menjalankan JS sembarang di halaman untrusted. Selektornya sendiri tidak
  menambah permukaan baru (sudah ada `browser_click` yang eval), tapi setiap tool baru = satu jalur eval lagi;
  tetap patuhi aturan katalog "yang menulis/mengeksekusi wajib minta izin" bila tool baru punya efek `exec`.
- **Izin baru hanya untuk screenshot** (bukan step-1). Itu wajib ditinjau Ryu sebelum dikerjakan.

---

## 5. Langkah pertama yang paling kecil & bisa dibuktikan (<= 1 berkas)

**1 berkas: `src/lib/zephyrTools/web.ts`.**
Tambah satu tool `browser_pick` (spec + `run`) yang hanya memanggil `evalPane(id, skripElementFromPoint)`,
persis pola `browser_click` (527-560) dan `browser_type` (563-596) yang sudah ada di berkas yang sama.
Tambahkan juga satu entri di blok WEB `catalog.ts` (berkas ke-2) — bila aturan "1 berkas" dipegang ketat,
entri katalog bisa memakai mekanisme tool yang sudah didaftarkan lewat awalan, tapi **sekali pun**, katalog &
handler harus sinkron (audit §D akan gagal bila tidak).

## 6. Ukuran "jadi" yang bisa diuji

- Buka halaman data lokal berisi elemen dengan `data-testid="tombol-simpan"`, panggil `browser_pane_cursor`
  untuk titik tombol itu, lalu `browser_pick(x,y)` → selektor mengembalikan `[data-testid="tombol-simpan"]`.
- `browser_click` dengan selektor itu benar-benar memicu handler (ubah teks DOM) — bukti jalur end-to-end.
- `scripts/audit-katalog-tool.mjs` tetap **LULUS**: nol "katalog tanpa handler", nol "handler tanpa katalog".
- ⚠️ **Anggaran per giliran SAAT INI sudah `26` (target `<= 20`, `MAKS` kelas WEB) — pakai
  `scripts/uji-kesiapan-fitur.mjs`.** Ini kondisi yang sudah ada sebelum spike (audit existing melaporkan
  angka sama). Menambah `browser_pick` **menaikkan** angka itu, jadi entri WEB baru **wajib** keputusan
  Ryu: entah tukar-keluar tool web lain, atau kurangi `TOOL_DIKIRIM_SELALU`.
- `npx tsc --noEmit` dari `D:/Zephyr` tetap **0 error**.
  Catatan (diukur 2026-10-14): repo **belum** 0 error — ada 3 error yang sudah ada di
  `src/lib/zephyrTools/kendaliJendela.ts` (TS6133 ×2 unused, TS2339 `tab.title`), **di luar lane ini**.
  Perbaiki dulu agar syarat "0 error" benar-benar bisa dipakai sebagai gerbang.
