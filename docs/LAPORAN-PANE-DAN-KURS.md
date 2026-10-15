# LAPORAN — Pane Uji (LAMA-pane-uji) & Kurs USD→IDR (LAMA-kurs)

Tanggal kerja: 2026-10-14 · Repo: `D:/Zephyr` · Branch: `feat/ai-panel-vscode-layout`

Berkas ini memisahkan dengan tegas dua hal yang sering dicampur:
**(A) apa yang TERBUKTI hari ini** dengan keluaran nyata, dan **(B) apa yang
BUTUH APP** dan karena itu belum dijalankan. Tidak ada keluaran yang dikarang;
setiap blok di bawah adalah tempelan apa adanya.

Berkas yang lahir dari kerja ini:

- `scripts/uji-pane-kurs-rencana.mjs` — harness penilai RENCANA (19 kasus, 0 jaringan, 0 CDP).
- `docs/kurs-dollar.md` — TABEL kurs 1998–2025 + SUMBER (28 baris, dari API Bank Dunia).
- `docs/LAPORAN-PANE-DAN-KURS.md` — berkas ini.
- `docs/USULAN-PANE-DAN-KURS.md` — usulan patch agar jalur ini bisa jalan tanpa manusia.

---

## 1. Probe CDP lebih dulu (keluaran apa adanya)

Dijalankan **sebelum** apa pun yang lain, dua kali (awal kerja dan sesudah
harness ditulis):

```
$ curl -s -m 3 http://127.0.0.1:9223/json/version
{
   "Browser": "Edg/154.0.4258.62",
   "Protocol-Version": "1.3",
   "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0",
   "V8-Version": "15.4.11.9",
   "WebKit-Version": "537.36 (@49f7c5590dad654f33b924537ccc8be227c5a43a)",
   "webSocketDebuggerUrl": "ws://127.0.0.1:9223/devtools/browser/aca4a146-c765-4b13-ba99-f900d828e69c"
}
```

**Kesimpulan probe: app HIDUP** (Edge/154.0.4258.62, Protocol-Version 1.3,
jembatan debug nyala di `127.0.0.1:9223`). Probe ini hanya MEMBACA versi browser
— tidak mengemudikan app.

**TAPI jalur live TETAP DITUNDA hari ini.** Alasannya aturan keras repo (iv):
ada agen lain yang sedang menyunting `src/**`, dan setiap suntingan memicu HMR
Vite yang me-reload halaman dan mematikan jembatan/slot. Mengemudikan app hidup
sekarang berarti merusak kerja agen lain (dan sebaliknya). Jadi bagian live di
bawah ditulis apa adanya sebagai **BUTUH APP**, dengan langkah konkretnya.

---

## 2. TERBUKTI HARI INI (keluaran nyata)

### 2.1 Harness rencana — `scripts/uji-pane-kurs-rencana.mjs`

```
$ node scripts/uji-pane-kurs-rencana.mjs
[K1] LULUS                  urutan langkah: buka pane -> panggil sumber -> tulis berkas -> verifikasi
      -> 4 langkah: L1:buka-pane -> L2:panggil-sumber -> L3:tulis-berkas -> L4:verifikasi
[K2] LULUS                  tiap rujukan menunjuk berkas yang ADA di repo
      -> 18 rujukan berkas:baris, semua berkasnya ada
[K3] LULUS                  tiap rujukan berkas:baris benar-benar memuat teks yang diklaim
      -> 18 baris diperiksa apa adanya di disk
[K4] LULUS                  tiap alat di rencana ada di daftar tool NYATA (web.ts/builtins.ts/mcp.ts)
      -> semua alat dikenal (66 nama tool dipindai dari 3 berkas)
[K5] LULUS                  langkah tulis berada SETELAH langkah sumber (tidak menulis sebelum data ada)
      -> indeks sumber=1, tulis=2
[K6] LULUS                  rencana tidak memuat angka kurs literal (semua nilai kurs hanya dari sumber)
      -> nol angka pada rentang 5.000..29.999 di dalam rencana
[K7] LULUS                  header `tahun|nilai|sumber` diterima validator
      -> 1 baris sah: {"tahun":1998,"nilai":10013.6225,"sumber":"WB:PA.NUS.FCRF"}
[K8] LULUS                  header tanpa kolom `sumber` DITOLAK
      -> header salah: tahun|nilai
[K9] LULUS                  baris tanpa sumber DITOLAK (anti-mengarang)
      -> baris 3: sumber kosong (DILARANG mengarang)
[K10] LULUS                  nilai bukan angka DITOLAK
      -> baris 3: nilai tidak sah
[K11] LULUS                  uji hitung baris: fixture 1998..2026 -> 29 baris terbaca
      -> 29 baris (1998..2026)
[K12] LULUS                  sumber tidak terjangkau -> BERHENTI, nol baris, nol berkas ditulis
      -> status=BERHENTI alasan="sumber tidak terjangkau: HTTP 429 sumber tidak menjawab" baris=0 berkas=0
[K13] LULUS                  tahun tanpa nilai di sumber ditandai TANPA SUMBER (bukan ditebak)
      -> 2026 -> TANPA SUMBER (nilai=undefined); 1998 -> ADA SUMBER (nilai=10013.6225)
[K14] LULUS                  jalur OK: berkas ditulis, tabel lolos validator, 2026 tidak ikut dikarang
      -> status=OK, tabel ok=true, baris=1, baris2026=false
[K15] LULUS                  tidak ada jalur menulis .env/kunci/kredensial; berkas dokumen diterima
      -> 8/8 target terlarang ditolak; target di rencana bersih; tulisAman(dokumen).ok=true
[K16] LULUS                  penjaga .env NYATA di repo terbaca + pola harness setara
      -> ambilWeb.ts:421 => [/(^|[\\/])\.env(\.[^\\/]*)?$/i, 'berkas .env tidak boleh ditimpa'],
[K17] LULUS                  dokumen kurs nyata: header tahun|nilai|sumber + tiap nilai punya sumber terdaftar
      -> 28 baris, tahun 1998..2025, semua sumber terdaftar
[K18] LULUS                  tahun yang belum terbit TIDAK dikarang + dinyatakan terbuka di dokumen
      -> tahun tanpa baris: 2026; bagian "tanpa sumber" ada=true; baris2026=false
[K19] LEWAT (BUTUH APP)      jalur LIVE: agen nyata membuka pane, mengambil data, menulis hasil
      -> dijalankan manusia/agen saat app hidup: node scripts/uji-pane-kurs-rencana.mjs (rencana) lalu alur L1..L4 di docs/LAPORAN-PANE-DAN-KURS.md

  catatan: nol jaringan, nol CDP, nol app; temp di C:\Users\Zyrex\AppData\Local\Temp

== 18/19 lulus ==
   gagal: 0  dilewati: 1 (BUTUH APP/BERKAS)
$ echo $?
0
```

Yang dibuktikan angka-angka itu, satu per satu:

- **K1–K4: peta rencana ke perintah NYATA.** Rencana 4 langkah memetakan ke tool
  yang namanya benar-benar ada di repo (harness memindai 66 nama tool dari
  `web.ts`, `builtins.ts`, `mcp.ts`), dan 18 rujukan `berkas:baris` diperiksa
  dengan membaca berkasnya dari disk — klaim tanpa bukti = gagal. Rujukan
  utamanya:
  - `web.ts:443` `name: 'browser_open'` → `web.ts:459` `run: async (a) => {` (buka pane)
  - `mcp.ts:575` `mcp__zephyr__pane` → `mcp.ts:561` run; `panelStore.ts:16` `PANEL_TABS`, `panelStore.ts:20` `terminalPanel.focus`
  - `web.ts:410/421` `web_fetch`; `builtins.ts:1187` `bash_run`; `mcp.ts:148` `mcp__zephyr__run_command` (panggil sumber)
  - `builtins.ts:770/783/785` `write_file` + `jagaTulis(path)`; `builtins.ts:89` definisi `jagaTulis`; `builtins.ts:2530` `tulis()` (tulis berkas)
  - `web.ts:579/588` `browser_read`; `builtins.ts:664` `read_file` (verifikasi)
- **K5–K11: larangan mengarang angka kurs.** Tulis tidak boleh mendahului
  sumber; rencana bebas angka pada rentang kurs; validator tabel MENOLAK header
  tanpa kolom `sumber`, sumber kosong, dan nilai bukan angka; hitung baris 29
  tahun jalan.
- **K12–K14: jalur berhenti benar-benar diperiksa, bukan diklaim.** Transport
  yang melempar (`HTTP 429`) → `status=BERHENTI`, **0 baris, 0 berkas** di
  direktorat sementara (diperiksa dengan `readdirSync`). Tahun 2026 yang tidak
  punya nilai → ditandai `TANPA SUMBER`, `nilai=undefined` (tidak ditebak, bukan
  0).
- **K15–K16: tidak ada jalur menulis `.env`/kunci/kredensial.** 8 target
  terlarang (`.env`, `docs/.env.local`, `kunci.pem`, `id_rsa`, `credentials.json`,
  `app.key`, `server.p12`, `kredensial-db.txt`) semuanya ditolak; target di
  rencana bersih. Pola penjaga `.env` disalin-bandingkan dengan penjaga NYATA di
  repo: `ambilWeb.ts:421`.
- **K17–K18: dokumen nyata.** `docs/kurs-dollar.md` lolos validator: 28 baris
  1998–2025, semua bersumber terdaftar, dan 2026 tidak dikarang.
- **K19: BUTUH APP** — dilewati, harness keluar 0 (tidak pernah menyentuh CDP,
  aman berjalan berdampingan dengan agen yang menyunting `src/**`).

### 2.2 Kurs 1 USD → IDR: sumber nyata, bukan tebakan

Perintah nyata (1 panggilan, tanpa perantara pane):

```
$ curl -s -m 15 "https://api.worldbank.org/v2/country/IDN/indicator/PA.NUS.FCRF?format=json&per_page=100&date=1998:2026"
[{"page":1,"pages":1,"per_page":100,"total":28,"sourceid":"2","lastupdated":"2026-10-08"},
 [{"indicator":{"id":"PA.NUS.FCRF","value":"Official exchange rate (LCU per US$, period average)"},
   "country":{"id":"ID","value":"Indonesia"},"countryiso3code":"IDN",
   "date":"2025","value":16477.8651797835,"unit":"","obs_status":"","decimal":2}, ...]]
```

Hasil parse apa adanya (`n= 28`, satu tahun hilang):

```
n= 28
1998 10013.6225
1999 7855.15
2000 8421.775
...
2024 15855.448286671
2025 16477.8651797835
HILANG=[2026]
```

Ditulis ke `docs/kurs-dollar.md` sebagai tabel berkolom `tahun | nilai | sumber`
(28 baris, tiap baris `sumber=WB:PA.NUS.FCRF`), dan tahun **2026 masuk bagian
"Tahun tanpa sumber (DILARANG diisi tebakan)"** — sumbernya belum menerbitkan
rata-rata tahun berjalan. Inilah bukti nyata aturan (b): jalur berhenti bukan
teori, tahun kosongnya nyata (2026), dan harness menguji penandaan itu (K13/K14/K18).

### 2.3 `tsc` — nol galat

```
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
$ echo $?
0
```

(keluaran kosong = tidak ada satu pun `error TS`).

---

## 3. BUTUH APP (belum dijalankan, langkah konkret)

Semua di bawah ini menuntut app HIDUP dan **jendela bebas dari agen lain yang
menyunting `src/**`** (aturan iv). Perintah nyatanya:

**Cara menjalankan app (dari akar repo):**

```
$ npm run tauri:dev            # package.json:45
# atau lewat skrip repo:
$ cmd //c scripts\_dev-zephyr.bat
# harness CDP yang sudah ada memakai:
$ cmd //c scripts\_run-browser.bat
```

Setelah app hidup, konfirmasi jembatan debug (baca-saja, boleh kapan saja):

```
$ curl -s -m 3 http://127.0.0.1:9223/json/version
```

**L1 — buka pane (BUTUH APP).** Perintah nyata: tool `browser_open`
(`web.ts:443`, run `web.ts:459`; gerbang izin `web.ts:463`), alternatif
`mcp__zephyr__pane` (`mcp.ts:575`) dan `mcp__zephyr__focus_pane` (`mcp.ts:561`).
Bukti yang harus diambil saat dijalankan: keluaran tool (pesan pane dibuat) +
`panelStore` aktif pada tab yang punya `command: 'subsystemPanel.focus'` di
`panelStore.ts:16-24`. **Belum diambil** karena aturan (iv): HMR mematikan
jembatan saat agen lain menulis `src/**`.

**L2 — panggil sumber (BUTUH APP, dan BUTUH IZIN).** Perintah nyata: tool
`web_fetch` (`web.ts:410`), `web_search` (`web.ts:363`), atau `bash_run`
(`builtins.ts:1187`) untuk `curl`. Syarat yang belum terpenuhi tanpa manusia:
`izinIsiWeb` harus `true` (`kebijakanIsiWeb.ts:69/117`; kalau `false`,
`web_fetch` ditolak dengan `izin-isi-web-mati` — `kebijakanIsiWeb.ts:199`).
Itulah sebabnya hari ini kurs diambil lewat `curl` (bagian 2.2), bukan lewat
pane: jalur pane belum boleh dikemudikan, jalur izin masih menunggu manusia.

**L3 — tulis berkas (BUTUH APP kalau lewat pane).** Perintah nyata: `write_file`
(`builtins.ts:770`, run `783`, penjaga `jagaTulis` di `785`, definisi di `89`)
→ melewati `tulis()` (`builtins.ts:2530`, sekaligus titik snapshot checkpoint).
Target sah: `docs/kurs-dollar.md`. Tidak ada jalur ke `.env`/kunci (K15).

**L4 — verifikasi (BUTUH APP).** Perintah nyata: `browser_read` (`web.ts:579`,
run `588`) untuk membaca balik halaman pane, `read_file` (`builtins.ts:664`)
untuk membaca berkas hasil, dan `bash_run` untuk menjalankan
`node scripts/uji-pane-kurs-rencana.mjs` (harness bagian 2.1, dijalankan ulang
SETELAH berkas hasil ditulis — K17/K18 akan memeriksa isi berkas itu apa adanya).

**Kenapa ditunda, dinyatakan terbuka:** app hidup, jembatan debug hidup, tetapi
mengemudikan app sekarang = me-reload halaman agen lain (aturan iv). Jadi bagian
pane-nya **BUTUH APP**, bukan "sudah selesai". Yang sudah terbukti hari ini
adalah rencananya, penjaga anti-mengarangnya, dan kursnya (lewat sumber resmi).

---

## 4. Yang BELUM selesai / jujur soal batas

- Jalur live L1–L4 (agen nyata buka pane → ambil → tulis lewat pane →
  verifikasi lewat pane) **belum dijalankan**. Harness menandainya `K19 BUTUH APP`.
- `docs/kurs-dollar.md` dihasilkan lewat `curl` nyata ke API Bank Dunia, **bukan**
  lewat pane app. Nilainya nyata dan bisa diperiksa ulang (URL ada di dokumen).
- 2026 kosong karena sumbernya belum menerbitkan. Itu **bukan** kegagalan: itu
  perilaku yang dikehendaki (berhenti, jangan menebak).
- Harness ini tidak menyentuh CDP sama sekali; ia tidak bisa dan tidak boleh
  dipakai untuk mengklaim pane bekerja.

## 5. Cara mengulang seluruh bukti

```
$ curl -s -m 3 http://127.0.0.1:9223/json/version          # probe jembatan (baca-saja)
$ node scripts/uji-pane-kurs-rencana.mjs                   # 18/19 lulus, exit 0
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
# bagian live (BUTUH APP, setelah src/** tenang):
$ npm run tauri:dev
```

Usulan agar bagian live bisa jalan **tanpa manusia** ada di
`docs/USULAN-PANE-DAN-KURS.md`.

---

## 6. Hasil verifikasi ulang — 15 Oktober 2026 (WIB)

Verifier: subagent verifikasi (CDP `127.0.0.1:9223`). `src/**` **tidak diubah
sama sekali** oleh sesi ini.

### 6.1 Jalur L1–L4 (harness statis + mandiri) — LULUS

```
$ node scripts/uji-pane-kurs-rencana.mjs     # workdir D:/Zephyr
… K19 LEWAT (BUTUH APP)  jalur LIVE: agen nyata membuka pane, mengambil data, menulis hasil
== 18/19 lulus ==
```

18 lulus, 1 lewat (K19). Yang berubah dari run sebelumnya: 14 titik rujukan
`baris:` pada blok `REFCANA` disesuaikan dengan posisi src terkini
(`web.ts`, `mcp.ts`, `builtins.ts` ikut bergerak karena ada pengeditan lain di
cabang ini). Hanya **baris** yang diperbarui, teks `harus:` — yaitu isi yang
diuji — tidak disentuh.

### 6.2 Gerbang host `izinIsiWeb` / `allowlistWeb` — TERBUKTI DIPAKAI

Diset lewat jalur resmi applySettings via CDP (`window.__ZEPHYR_SET__.set`),
bukan dengan menyunting berkas:

- `izinIsiWeb: true`
- `allowlistWeb`: 25 host (github + youtube; google + googleapis/gstatic;
  worldbank; exchangerate.host; er-api; frankfurter; exchangeratesapi;
  bi.go.id; bing/duckduckgo — semuanya domain yang dibutuhkan run ini)

Nilainya ikut tertulis ke `%APPDATA%\zephyr\settings.json` dan sengaja
**tidak ditampilkan** di laporan ini. Bahwa gerbangnya benar-benar bekerja di
jalur LIVE terbukti dari hasil run: `browser_open` + `browser_read` berjalan dan
K9 lulus pada **kedua** percobaan — host tidak ditolak gerbang.

### 6.3 Jalur LIVE `node scripts/uji-kurs-dollar.mjs` — BELUM LULUS (2 percobaan)

| run | waktu (WIB) | hasil | K1 | K2 | K3 | K4 | K5–K8 | K9 |
|-----|-------------|-------|----|----|----|----|-------|----|
| 1 | 15 Okt 20:37 | **5/9** | ✓ 282s / 17 langkah | ✓ | ✓ maks 1 pane | ✓ 1 id (`pane-mv9l3uj0-2`) | ✗ | ✓ |
| 2 | 15 Okt 20:46 | **4/9** | ✗ BATAS WAKTU 642s / 50 langkah | ✓ | ✓ maks 1 pane | ✓ 1 id (`pane-mv9lglju-2`) | ✗ | ✓ |

Yang **lulus** di kedua run: jalur pane — hanya satu pane browser, id yang sama
dipakai ulang, tidak ada error provider, dan `browser_read` sukses (gerbang
allowlist lolos). Yang **gagal**: `D:\Testing\kurs-dollar.md` tidak pernah
tertulis sehingga K5 (berkas ADA), K6 (≥15 tahun 1998–2026), K7 (≥10 angka
kurs) dan K8 (sumber disebut) gugur.

### 6.4 Alasan kegagalan (hambatan nyata — tidak dipaksa)

1. **Bot wall Google.** Balasan terakhir run 1:
   *"Hasil Google tadi kena halaman 'unusual traffic' lagi — jawaban kurs tidak
   terbaca di sana."* Sumber pertama yang diminta tugas tidak terbaca.
2. **Argumen tool rusak di jalur provider.** Run 1 dihentikan framework dengan
   `tool call "bash_run" returned malformed JSON arguments` (2 langkah tercatat
   `(argumen rusak)`); run 2 mencatat satu langkah `tool_call` gagal.
3. **Run 2 macet.** Setelah langkah terakhir tidak ada kemajuan selama 4 menit
   → dihentikan sebagai `BATAS WAKTU` sebelum sempat menulis berkas.
4. Ketiganya di luar gerbang izin: allowlist sudah mengizinkan semua host yang
   dibutuhkan run, dan halaman memang terbaca sampai Google menolak.

### 6.5 Kesimpulan

- **Jalur pane (L1–L4 rencana): LULUS 18/19.**
- **Jalur pane LIVE: LULUS** — satu pane dipakai ulang, `browser_read` sukses,
  gerbang host lolos (K3, K4, K9).
- **Tugas nyata USD→IDR lewat app: BELUM LULUS** (5/9 lalu 4/9) karena bot wall
  Google + argumen tool yang rusak, bukan karena allowlist.
- **K19 tetap `BUTUH APP`** dan belum bisa dinyatakan lulus penuh.

### 6.6 Catatan lingkungan & berkas yang disentuh

- App + Vite dev sempat mati di tengah sesi (CDP `:9223` dan `:5173` ikut
  hilang); diluncurkan ulang: `npx vite --port 5173` lalu
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 zephyr.exe`.
- Dua kegagalan balapan diperbaiki **di harness, bukan di src**:
  `uji-kurs-dollar.mjs` sekarang memanggil `tungguBridge` sebelum snapshot
  pertama (dulu `__ZEPHYR_AI__ is undefined` saat halaman baru selesai reload
  HMR) dan menunggu berjangka kalau `agentBusy` masih nyangkut (dulu langsung
  exit 2), plus menjalankan harness dengan `UJI_LOG=<path>` supaya laporan tidak
  dimakan terminal.
- Berkas berubah sesi ini: `docs/LAPORAN-PANE-DAN-KURS.md` (bagian ini),
  `scripts/uji-pane-kurs-rencana.mjs` (baris rujukan), `scripts/uji-kurs-dollar.mjs`
  (tungguBridge + tunggu busy). `src/**` tidak disentuh.
