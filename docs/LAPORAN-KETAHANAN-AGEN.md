# Laporan ketahanan agen + cacat harness (item 137, item 145)

Tanggal: 14 Oktober 2026 (sesi malam 13–14 Okt, WIB/UTC+7).
Lingkup: **hanya harness** (`scripts/`) dan dokumen (`docs/`). Tidak ada berkas
`src/**` atau `src-tauri/**` yang diubah. App Zephyr dan dev server **tidak
dinyalakan/dimatikan** oleh lane ini; uji MCP memakai app yang sudah berjalan.

Kejujuran lebih dulu: **tidak ada satu pun item di bawah yang ditandai selesai
karena "kelihatannya hijau"**. Semua angka di dokumen ini datang dari keluaran
skrip yang benar-benar dijalankan, dan yang masih lemah/tidak terukur ditulis di
§5 sebagai lemah/tidak terukur.

---

## 1. Item 137 — cacat harness `scripts/verify11.mjs` (V4 & V12 merah)

### 1a. Bentuk cacat yang ditemukan (dengan baris)

V4 (`terminal_write` + `terminal_key`) dan V12 (`screenshot_pane`) merah **bukan
karena bug app**, tapi karena tiga cacat di harness-nya sendiri:

| # | Cacat | Lokasi | Kenapa merah |
| --- | --- | --- | --- |
| H1 | Prasyarat "workspace terbuka & dipercaya" tidak disiapkan uji | `scripts/verify11.mjs:369-373` | `editor_open` hanya bisa membuka path DI DALAM workspace; tanpa itu langkah persiapan gagal dan V4 tidak pernah sampai ke uji terminal |
| H2 | Izin kendali terminal (`terminal control`) tidak dinyalakan uji | `scripts/verify11.mjs:432-437` | dengan izin mati, `terminal_write` dijawab `"permission denied: terminal control is disabled for MCP"` — harness membacanya sebagai kegagalan V4, padahal itu izin, bukan bug |
| H3 | RENDER-PAUSE xterm tidak dilepas | `scripts/verify11.mjs:449-479` | V4 membaca lewat `__ZEPHYR_PTY__.read` → `readBuffer` (buffer xterm). Pane yang di-pause punya izin benar + pane benar tapi **layar kosong** → V4 merah palsu; V12 mewarisi hal yang sama lewat `screenshot_pane` |
| H4 | V12 memakai `marker` milik V4 (ketergantungan antar-uji) | `scripts/verify11.mjs:879-887` | penanda V4 dibuat ~370 baris/8 uji sebelumnya; kalau V4 gagal, V12 jatuh karena ketergantungan, bukan karena `screenshot_pane` rusak |

Perbaikan yang sudah ada di berkas:
- H1/H2: langkah persiapan nyata — workspace dibuka, izin kendali terminal
  dinyalakan (dan dilaporkan: `V4-persiapan: izin kendali terminal dinyalakan
  (semula false)`).
- H3: render-pause dilepas sebelum uji terminal (`V4-persiapan:
  render-pause=lepas`), dan V4 menunggu sampai baris benar-benar terlihat di
  buffer xterm (bukan `sleep(2200)` buta).
- H4: V12 sekarang menulis penandanya **sendiri** lewat jalur MCP yang sama
  (`terminal_write` + `terminal_key`), menunggu sampai terlihat, baru memotret —
  tidak lagi meminjam penanda V4.
- Assertion V4 tidak dilunakkan: V4 tetap menuntut (i) baris hasil `echo`
  benar-benar muncul di buffer xterm, dan (ii) `paneId` salah dijawab **error
  JSON-RPC** — keduanya diuji, bukan dihapus.

### 1b. Keluaran nyata `node scripts/verify11.mjs` (exit 0)

```
# target: Zephyr — Code Editor

LULUS  V1   server mati: /health → tidak ada koneksi, port 9222 TIDAK listening; UI "Stopped"
LULUS  V2   switch ON → /health {ok:true, version 1.1.13, uptime 928ms}; tanpa Bearer 401, token salah 401, token benar 200; GET /schema butuh auth & memuat 20 tool; UI "Running (127.0.0.1:9222) · 1s"
LULUS  V3   list_panes → 2 pane: shell(pid 54352, running), private(pid 68540, running); list_terminals identik
V4-persiapan: izin kendali terminal dinyalakan (semula false)
V4-persiapan: render-pause=lepas
LULUS  V4   terminal_write "echo MCP-V4-mv78x1jh" + terminal_key Enter → shell mengeksekusinya, buffer xterm memuat baris hasil "MCP-V4-mv78x1jh" (1x, terlihat pada 400 ms); paneId salah dijawab error JSON-RPC
TITIK V4: status=200 41ms
LULUS  V5   editor_open dari-mcp.txt → tab t1 dibuat & difokuskan (tab bar: ["dari-mcp.txt✕"]), CodeMirror ter-mount, halaman Settings otomatis ditutup; list_editors mengonfirmasi path & active
LULUS  V6   editor_insert at=0 → buffer & dokumen CodeMirror berubah, dot dirty muncul (1); editor_write mengganti seluruh buffer; FILE DI DISK tetap isi asli pada kedua kasus (kontrak: buffer saja)
TITIK V6: status=200 25ms
LULUS  V7   run_command terminal.new → pane pane-mv78x3xy-4 hidup (2 → 3 pane), panel terminal terlihat; command tak dikenal dijawab error berisi daftar yang tersedia; panel mencatat 12 permintaan dilayani
LULUS  V8   centang opencode + [Tulis ke CLI] → opencode.json punya mcp.zephyr (url 127.0.0.1:9222, header Bearer), key lain (theme, mcp.lain) UTUH, backup .bak dibuat tanpa entri zephyr, badge UI "registered"; [Lepas dari CLI] → entri zephyr hilang, config tetap valid
TITIK V8: status=200 54ms
LULUS  V9   switch OFF saat CLI aktif → /health & JSON-RPC menolak koneksi, port 9222 berhenti listening; switch ON lagi → /health 200 dan list_panes normal (3 pane)
TITIK V9: status=200 58ms
LULUS  V10  port 9222 diblokir proses lain → server bind ke 9224 (kandidat 9222..9226; 9223 di mesin ini dipakai debug port WebView2): /health 200, JSON-RPC 200; UI menampilkan "Running (127.0.0.1:9224) · 1s" + banner "Port 9222 is used by another program, so the server moved to…"; settings.mcp.port ikut jadi 9224
TITIK V10: status=200 33ms
LULUS  V11  12 permintaan editor_insert dari dua agent dikirim BERSAMAAN → semua dijawab 200, ke-12 token utuh di buffer (tidak ada yang hilang/tercampur), 0 console error; total dilayani 32
TITIK V11: status=200 40ms
LULUS  V12  set_setting editor.tabSize=8 diterima (UI ikut jadi 8 setelah 0 ms); mcp.enabled & git.github.clientId DITOLAK whitelist; get_settings memask mcp.token → "***" dan membuang git.github; get_setting mcp.token ditolak; screenshot_pane menulis zephyr-pane-panemv78wxur2-1791930120.txt berisi isi terminal nyata; list_extensions → 9 ekstensi

== 12/12 lulus ==
EXIT=0
```

V4 dan V12 **hijau** dan membuktikan perilaku nyata: V4 benar-benar menjalankan
`echo` di shell lewat `terminal_write`+`terminal_key` dan menemukan hasilnya di
buffer xterm; V12 memotret pane yang benar-benar berisi keluaran terminal.

---

## 2. Cacat di harness BARU ini yang ketangkap saat pengembangan (bukti bahwa ujinya tidak dibuat selalu-lulus)

`scripts/uji-ketahan-agen.mjs` generasi pertama keluar **11 hijau / 3 merah**
(exit 1). Ketiga merah itu bukan bug app, tapi **assertion saya yang salah** —
dan itu tercatat di sini supaya jelas ujinya pernah benar-benar merah:

| Uji | Keluhan awal | Sebab sebenarnya |
| --- | --- | --- |
| `a1-giliran-selesai` | setelah frame `done`, `agentBusy` tetap `true` | assertion saya salah: frame terminal hanya melepas slot `pending`; `agentBusy` dilepas oleh jalur keluar run (`src/lib/aiStore.ts:7117`, komentar aslinya: *"satu-satunya jalur keluar run"*), yang hanya berjalan saat proses Tauri benar-benar keluar. Diuji ulang lewat giliran NYATA (§3:a5) dan restart (§3:a4) |
| `a3-dibatalkan-user` | `cancel()` tidak langsung melepas status | perilakunya memang begitu: `cancel()` hanya **menandai niat** (phase `cancelling`); yang melepas adalah jalur keluar run. Assertion lama menuntut yang salah |
| `b1-parseDraft-10-kasus` | 2 dari 10 kasus "tidak sesuai" | ekspektasi saya salah, bukan pengurainya: `[{"name":"a","body":"b"}]` **dipulihkan** (jendela `{` pertama..`}` terakhir) dan dua objek berurutan **ditolak jujur** (`null`). Perilaku nyata kode ini benar; **0 kasus melempar** |

Yang **tidak** saya lakukan: menghapus kasus, atau melonggarkan syarat "tidak
boleh mogok". Assertion inti tetap: *tidak melempar* + *tidak mengarang* +
*status akhir bersih*.

---

## 3. Bukti 3 cacat perilaku lama — lewat jalur DETERMINISTIK

Skrip: `scripts/uji-ketahan-agen.mjs` (BARU). Keluar **0 = hijau**, **1 = merah**,
**2 = tidak bisa diukur**. Syarat: tanpa jaringan, tanpa model nyata, tanpa Tauri,
tanpa app menyala.

Yang diuji adalah **kode ASLI repo**, bukan salinan: `src/lib/aiStore.ts` dan
`src/lib/agentDraft.ts` dibundel saat jalan dengan esbuild lokal (offline) ke
folder sementara lalu diimpor. Satu-satunya "SALINAN" ada di `pasangShim()` —
tiruan minimal objek browser/Tauri supaya modul frontend bisa dimuat di Node;
itu bukan logika Zephyr, tidak diuji, dan **setiap IPC Tauri sengaja GAGAL**
(`no-tauri-in-node`) supaya tidak ada data karangan.

### 3a. `lama-busy` — status "sedang bekerja" harus kembali normal

```
LULUS  a1-frame-terminal-lepas-id frame terminal (done) untuk req-1 dilepas: pending "req-1" -> null; agentBusy=true (dilepas jalur keluar run → a4/a5)
LULUS  a2-frame-duplikat          frame terminal kedua (id yang sama, sudah selesai) tidak mengubah status: sibuk tetap true
LULUS  a3-batal-di-tengah-giliran giliran nyata dibatalkan saat berjalan (sedang-jalan=false, phase saat batal=idle) → status akhir bersih: {"agentBusy":false,...,"pending":null,...,"phase":"idle","sibuk":false}
LULUS  a4-restart-saat-sibuk      init() asli setelah "crash" di tengah giliran: sibuk true -> false, phase=idle
         sesudah: {"agentBusy":false,"busyComposer":false,"pending":null,"pendingComposer":null,"phase":"idle","sibuk":false}
LULUS  a5-giliran-gagal           giliran NYATA gagal (provider offline, 199 ms, kunci terpasang=true) → status kembali normal
         jalur=selesai hasil=false
         transisi status yang terekam (3): idle/sibuk=false | thinking/sibuk=true | idle/sibuk=false
         pesan terakhir: [{"role":"assistant","error":null,"panjang":101}] toast=null
```

Artinya: giliran nyata (yang gagal karena provider offline) mengubah status
`sibuk=true` → `sibuk=false` dan phase kembali `idle`; restart di tengah giliran
juga tidak meninggalkan status nyangkut; frame terminal yang datang dua kali
tidak merusak apa pun. **Tidak terbukti lagi.**

### 3b. `lama-merah` — JSON rusak tidak mematikan agen

Pengurainya `parseDraft` (ASLI, `src/lib/agentDraft.ts:127`), diumpani 10 bentuk
rusak: kepotong tengah objek, tanda kutip kabur, tanpa brace, `name` tanpa
`body`, kosong, sampah, array berisi objek, teks di luar JSON, pagar kode
(fence), dan dua objek berurutan.

```
LULUS  b1-parseDraft-10-kasus     parseDraft (pengurai ASLI, src/lib/agentDraft.ts:127) diumpani 10 bentuk JSON rusak: 0 mogok, 10/10 sesuai harapan, 1.0 ms
         kepotong-tengah-objek mogok=tidak terbaca=false harusnya=false → sesuai
         tanda-kutip-kabur    mogok=tidak terbaca=false harusnya=false → sesuai
         tanpa-brace          mogok=tidak terbaca=false harusnya=false → sesuai
         name-tanpa-body      mogok=tidak terbaca=false harusnya=false → sesuai
         kosong               mogok=tidak terbaca=false harusnya=false → sesuai
         sampah               mogok=tidak terbaca=false harusnya=false → sesuai
         array-berisi-objek   mogok=tidak terbaca=true harusnya=true → sesuai
         teks-di-luar-json    mogok=tidak terbaca=true harusnya=true → sesuai
         pagar-kode           mogok=tidak terbaca=true harusnya=true → sesuai
         dua-objek-ambigu     mogok=tidak terbaca=false harusnya=false → sesuai
LULUS  b2-isi-utuh-setelah-teks   jawaban yang dikelilingi kalimat tetap terbaca utuh: name="rapikan-repo", body="langkah"
LULUS  b3-tolak-jujur-bukan-mengarang JSON yang tanda kutipnya kabur dijawab null (jujur: tidak bisa dibaca), BUKAN objek karangan → null
```

Buktinya: **0 dari 10 kasus melempar** (agen tidak mogok), isi yang masih
terbaca tetap utuh, dan yang ambigu dijawab `null` — **menolak jujur, tidak
mengarang jawaban**. Ini yang membedakan uji ini dari harness lama yang memakai
`scripts/mock-ai.mjs`: di sini tidak ada mock yang mengarang balasan.

### 3c. `lama-besar` — tugas besar (40+ berkas) tidak mematikan agen

```
LULUS  c1-40-berkas-daftar        berkasDitulisGiliran (ASLI) atas 40 berkas + 6 langkah kotor (duplikat/kepotong/kutip kabur/kosong/sampah/gagal) → 40 berkas unik, urutan terjaga (0.5 ms)
         pertama=docs/generated/berkas-0.md terakhir=docs/generated/berkas-39.md unik=40
         tidak ada 'broken-quote'/'gagal': true
LULUS  c2-4000-berkas-tidak-meledak skala 100x (4000 berkas): 4000 berkas terdaftar dalam 60 ms — jalur daftar panjang tidak meledak
LULUS  c3-status-40-todo          statusPekerjaan (ASLI) atas 40 todo + 40 langkah: 2087 karakter, ke-40 berkas tersebut semuanya disebut (48.3 ms)
LULUS  c4-ekor-hanya-baca         ekorHanyaBaca(40 langkah tulis + kotor, maks 20) = 0 — jalur 'tulis terus' terbaca sebagai bukan-hanya-baca (tidak nyangkut di 20)
LULUS  c5-bagi-langkah-40         bagiLangkahDariRiwayat atas 80 pesan (40 langkah): 80 langkah, 0.6 ms
LULUS  c6-wire-riwayat-dibatasi   bentukWireRiwayat atas 80 pesan: 40 pesan keluar (≤ masuk = digabung/dipangkas, bukan tumbuh), 0.1 ms
```

Artinya: daftar 40 berkas (bahkan 4.000) tetap terurut, unik, dan tidak meledak;
langkah kotor (duplikat, argumen kepotong, tanda kutip kabur, argumen kosong,
sampah, langkah gagal) tidak mengotori daftar; status pekerjaan tetap
menampilkan seluruh 40 berkas; riwayat panjang **dipangkas/digabung** (80 pesan
masuk → 40 keluar), bukan tumbuh bebas.

### 3d. Ringkasan keluaran (exit code)

```
Ringkasan uji-ketahan-agen: 14 pemeriksaan — 14 hijau, 0 merah
kesimpulan: ketiga cacat lama (busy/merah/besar) TIDAK terbukti lagi pada kode saat ini
EXIT=0
```

---

## 4. Item 145 — kerusakan karena HTTP 429 (dicatat apa adanya)

**Yang tidak bisa saya pastikan, saya tulis sebagai tidak pasti:** tidak ada log
yang mencatat kejadian 429. Jadi **jumlah, jam persis, dan perintah yang mati
tidak bisa dibuktikan dari berkas** — hanya bisa disimpulkan dari kejadian sesi.

Yang **ada** jejaknya:

| Waktu (WIB) | Sumber | Isi apa adanya |
| --- | --- | --- |
| 14 Okt 01:41:19 / 01:41:40 / 01:42:05 / 01:43:22 | `%APPDATA%\zephyr\logs\zephyr.log` | `[error] putus` (4×) — koneksi provider putus, berurutan ~20–77 dtk, lalu app di-start ulang 3× dalam 1 dtk (01:46:40) |
| sesi ini | pengamatan langsung | beberapa proses mati di tengah jalan karena provider membalas **HTTP 429** (batas kecepatan provider VIP); proses berhenti tanpa kesimpulan, yang tersisa galat mentah |
| — | `docs/PROVIDER-429.md` §4 | "**Asal 429 hari ini tidak terekam.** Tidak ada log yang mencatat '429 terjadi, percobaan ke-N, pulih/gagal'" |

Yang **sudah** ada di app (jangan dibangun ulang) — `docs/PROVIDER-429.md`:
klasifikasi galat permanen vs sementara (`aiStore.ts:2020-2051`, `429` masuk
"bisa diulang"), tangga tunggu-pulih `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]`
(`aiStore.ts:2097-2120`), fallback model sekali per run yang **diumumkan ke user**
(`aiStore.ts:5876-5898`), jalur chat `RETRY_CHAT = [1200, 3000]`
(`aiStore.ts:4756-4801`).

Celah yang tersisa: (i) pemanggil **di luar app** (skrip ukur) tidak punya
penanganan 429 sama sekali; (ii) jalur **chat biasa** hanya mengulang 2×/±4 dtk
tanpa tangga tunggu-pulih dan tanpa fallback model; (iii) tidak ada log kejadian
429, jadi kerusakan tidak bisa dihitung.

### Saran penanganan (singkat, untuk keputusan Ryu)

1. **Retry berjenjang di skrip ukur** (berkas baru `scripts/lib-429.mjs`):
   `pesanRateLimit(teks)` mendeteksi `429`/`too many requests`/`rate limit`/
   `quota`, lalu `tungguPulih(fn, { maks: 3, jeda: [4000, 12000, 22000] })`
   mengulang **hanya** galat rate-limit; kalau tangga habis, cetak
   **`TIDAK BISA DIUKUR: provider 429 setelah N percobaan`** dan keluar kode `2`
   — jangan stack trace, jangan LULUS. (Desain lengkap: `docs/PROVIDER-429.md` §2.)
2. **Selalu tulis hasil sementara ke berkas kerja** sebelum cetak akhir, supaya
   run yang mati di tengah tetap meninggalkan bukti (pola `scratch/` sudah ada).
3. **Jeda + pindah provider**: pakai tangga tunggu-pulih yang sudah ada di app;
   untuk jalur chat, pakai ulang `tungguProviderPulihAgent()` +
   `pilihModelCadangan()` dan tulis sebabnya di gelembung ("provider sedang
   membatasi; beralih ke <model>") — jangan diam-diam (ini milik lane `src/`).
4. **Log kejadian 429** ke `%APPDATA%\zephyr\logs\` dengan satu baris ringkas
   (waktu, percobaan ke-N, pulih/gagal) supaya kejadian berikutnya bisa dihitung
   — hari ini tidak bisa.

---

## 5. Yang masih lemah / tidak terukur (jujur, tidak disembunyikan)

1. **`a3` tidak dijamin benar-benar "di tengah giliran".** Provider offline gagal
   sangat cepat, sehingga saat `cancel()` dipanggil statusnya sudah `idle`
   (`sedang-jalan=false`). Yang **terbukti** dari a3: `cancel()` tidak melempar
   dan status akhirnya bersih. Yang **belum terbukti** oleh a3: pembatalan yang
   terjadi saat loop benar-benar sedang berjalan — untuk itu perlu provider yang
   menjawab lambat (jaringan), di luar syarat "tanpa jaringan".
2. **`a1` sengaja tidak menuntut `agentBusy` dilepas.** Pelepasan itu tugas jalur
   keluar run (`aiStore.ts:7117`) yang hanya berjalan saat proses Tauri keluar;
   tanpa app menyala, yang tersedia hanya frame terminal. Bukti pelepasan datang
   dari a4 (restart) dan a5 (giliran nyata gagal), bukan dari a1.
3. **`b1` "10/10 sesuai" berarti sesuai dengan perilaku kode saat ini**, bukan
   "semua bentuk rusak harus begitu". Dua ekspektasi awal saya keliru dan sudah
   dikoreksi setelah melihat perilaku nyata (dicatat di §2) — bukan syarat yang
   dilonggarkan: syarat "tidak melempar" tetap 10/10 tanpa pengecualian.
4. **Kerusakan 429 tidak bisa dihitung** (item 145): tidak ada log kejadian 429;
   yang ada hanya 4× `[error] putus` + pengamatan sesi. Angka jumlah/jam/perintah
   yang mati **tidak** dicantumkan karena tidak bisa dibuktikan.
5. **Uji ini tidak menyentuh jalur Tauri sama sekali.** Kalau bug-nya hanya
   muncul saat IPC Tauri benar-benar hidup (mis. loop run sungguhan), uji ini
   tidak akan menangkapnya — itu di luar izin lane ini (app tidak boleh
   dinyalakan/dimatikan).

---

## 6. Berkas yang diubah/dibuat lane ini

| Berkas | Status |
| --- | --- |
| `scripts/verify11.mjs` | diubah (cacat H1–H4 harness: prasyarat workspace, izin kendali terminal, render-pause, ketergantungan penanda V12) |
| `scripts/uji-ketahan-agen.mjs` | **BARU** — uji deterministik lama-busy/lama-merah/lama-besar (14 pemeriksaan, exit 0/1/2) |
| `docs/LAPORAN-KETAHANAN-AGEN.md` | **BARU** — dokumen ini |
| `docs/PROVIDER-429.md` | dibuat lebih awal di sesi ini (analisis penanganan 429) |
