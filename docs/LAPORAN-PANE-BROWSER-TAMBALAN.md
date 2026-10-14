# LAPORAN TAMBALAN — KEBIJAKAN ISI WEB PANE BROWSER

- **Item**: ZEPH-BROWSER-BUILTIN tahap TAMBALAN
- **Tanggal**: 2026-10-14
- **Repo / branch**: `D:\Zephyr` — `feat/ai-panel-vscode-layout`
- **Acuan celah**: `docs/LAPORAN-PANE-BROWSER.md` §5 (6 celah kode produk) dan blok `(B)` di §2
- **Cakupan tugas**: kebijakan isi web — (i) izin opt-in, (ii) daftar host/allowlist, (iii) batas ukuran
  keluaran, (iv) tidak ada jalur otomatis yang mengirim isi halaman ke model tanpa izin.
- **Aturan yang dipatuhi**: tanpa `git add`/`git commit`; tanpa wildcard di `scripts/`;
  `src/lib/zephyrIndeks.ts` & `src/lib/zephyrFakta.ts` tidak disentuh; harness CDP (`:9223`)
  **tidak dijalankan** (ada lane lain menyunting `src/**`).

**Vonis satu baris**: 6 celah dari laporan → **4 TERTAMBAL di lapisan TS** (B2, B3, B4, B6), dengan
tiga di antaranya masih menyisakan lantai Rust (U1/U3/U4/U5/U6), dan **2 MENUNGGU yang murni tidak
bisa ditambal dari TS** (B1 = batas byte sebelum bodi tiba; B5 = escape navigasi `browser_pane_eval`,
BUTUH APP). **0 celah yang bisa ditambal lewat TS** masih tersisa. Empat aturan kebijakan yang diminta
tugas keempatnya TERTAMBAL dan **diuji perilakunya** (29 kasus dari kode produk, bukan salinan aturan).

---

## 1. Celah (B) satu per satu + vonis

Sumber daftar: `docs/LAPORAN-PANE-BROWSER.md` §5 ("Celah kode produk (6, terkonfirmasi)").

| # | Celah (kutipan laporan) | Vonis | Bukti (berkas + baris nyata) |
|---|---|---|---|
| B1 | `web.rs:142` — bodi `read_to_string` tanpa batas byte → satu URL besar mengisi RAM (usulan U3) | **MENUNGGU** (lapisan Rust) | `src-tauri/src/web.rs:142` masih `read_to_string()`. Lapisan TS sudah memaksa batas: `web.ts:810` (`batasByteBerlaku`) dan `web.ts:812` (`batasiByte`) → bodi di atas batas **DITOLAK**, bukan dikirim (kasus K23/K24). Batas byte *sebelum* bodi tiba hanya bisa di Rust → tetap `MENUNGGU`. |
| B2 | `web.rs` — `web_fetch` tanpa allowlist domain (usulan U1/U6) | **TERTAMBAL** (lapisan TS) + **MENUNGGU** (lantai Rust) | Gerbang jalan **sebelum** perintah Rust dipanggil: `src/lib/zephyrTools/web.ts:410` (gerbang izin+allowlist+redirect) → `web.ts:429` `ambilIsiWeb(...)` → baru `cmd.webFetch`. Bukti kasus: K05, K06, K08, K09, K26 (fetcher dipanggil **0×** saat host di luar daftar). |
| B3 | `browser_pane.rs:52–57` — pane hanya cek awalan `http(s)://`; tidak memanggil `validate_outbound_url` (usulan U4/U5) | **TERTAMBAL** (lapisan TS) + **MENUNGGU** (lantai Rust) | Semua jalan masuk ke pane dijaga lebih dulu: `web.ts` (`browser_open`) `:463` `gerbangIsiKonten(url, kebijakan())`, `web.ts` (`browser_nav` goto) `:706`, `web.ts` (`system_browser_open`) `:839`. Lantai dalam `browser_pane.rs:43` sendiri masih tanpa `validate_outbound_url` → `MENUNGGU`. |
| B4 | `browser_pane.rs:212–218` — `browser_pane_nav` (`goto`) tanpa allowlist (usulan U5) | **TERTAMBAL** (lapisan TS) + **MENUNGGU** (lantai Rust) | `web.ts:706` `gerbangIsiKonten(tujuan, kebijakan())` di cabang `goto` `browser_nav` — gerbang yang **sama** dengan `browser_open` (satu titik keputusan, bukan dua aturan berbeda). |
| B5 | `browser_pane.rs:244` — `browser_pane_eval` menjalankan JS bebas → `location.href = …` melewati semua gerbang `open`/`nav`. **BUTUH APP** (usulan U9) | **MENUNGGU** (BUTUH APP) — jalur isi→model sudah ditutup di TS | Escape navigasi itu sendiri butuh app hidup untuk dibuktikan. Yang **tetap bisa dipastikan tanpa app**: isi pane tidak lagi mengalir ke model tanpa izin — `web.ts:352–356` (`bacaHalaman` → `saringKeModel`) diperiksa **walau pane sudah terbuka**; kasus K28: izin mati → `kirim=0`. |
| B6 | `web.ts:707–731` — `browser_download_url` menulis berkas lokal lewat `cmd.fsWrite` dengan `destination_path` dari model, **tanpa** `periksaTulis` (agentGuard) dan tanpa allowlist domain (usulan U8) | **TERTAMBAL** | Dua pagar + batas ukuran di jalur produk: `web.ts:803` `gerbangIsiKonten(url, kb)` (izin+allowlist), `web.ts:805` `periksaTulis(dest)` (agentGuard), `web.ts:810` batas byte (`BATAS_BYTE_BAWAAN` 2 MiB / `BATAS_BYTE_MAKS` 8 MiB), `web.ts:812` `batasiByte`. Bukti kasus: K22, K23, K25, K26. |

Ringkas: **4 TERTAMBAL** (B2, B3, B4, B6), **2 MENUNGGU** (B1, B5) — keduanya berada di lapisan Rust
yang **tidak bisa dijalankan** harness node di sini; sisa itu dicatat di `docs/USULAN-PANE-BROWSER.md`
(bagian "Sisa lane ZEPH-BROWSER-BUILTIN").

---

## 2. Perubahan kode produk (berkas + baris nyata)

### 2.1 Berkas baru — `src/lib/zephyrTools/kebijakanIsiWeb.ts` (343 baris, 14.401 byte, TANPA impor)

Satu titik keputusan; modul murni sehingga tidak bisa menyentuh store/jaringan (bukti statis S1/S2).

| Baris | Isi |
|---|---|
| `:54` | `export const BATAS_BYTE_BAWAAN = 2 * 1024 * 1024;` (2.097.152) |
| `:55` | `export const BATAS_BYTE_MAKS = 8 * 1024 * 1024;` (8.388.608) |
| `:56` | `export const BATAS_HOP_REDIRECT = 5;` |
| `:57` | `export const BATAS_KARAKTER_KELUARAN = 20000;` |
| `:58` | `export const PORT_SAH = ['', '80', '443'];` |
| `:97` | `export const KEBIJAKAN_TOLAK_SEMUA` — keadaan bawaan = **tolak semua** (izin opt-in) |
| `:111` | `kebijakanDariSetelan()` — field non-string dibuang, tidak memperluas izin (K04) |
| `:174` | `hostDiAllowlist()` — batas titik, subdomain sah diloloskan, akhiran menempel ditolak |
| `:198` | `periksaUrl()` — skema/port/IP privat/nama lokal + allowlist |
| `:238` | `gerbangIsiKonten()` — gerbang tunggal yang dipakai semua jalan masuk pane |
| `:244` | `ikutiRedirect()` — hop diperiksa ulang, rantai > 5 hop ditolak |
| `:261` / `:267` | `batasByteBerlaku()` / `batasKarakterBerlaku()` — clamp ke batas keras |
| `:272` / `:277` | `ukuranByte()` / `batasiByte()` |
| `:287` | `potongKeluaran()` — potong + penanda `[dipotong]` |
| `:314` | `saringKeModel()` — pintu terakhir isi → model (kirim=0 saat izin mati) |
| `:327` | `ambilIsiWeb()` — gerbang izin/allowlist/redirect **sebelum** fetcher dipanggil |

### 2.2 Berkas yang disunting — `src/lib/zephyrTools/web.ts` (845 baris)

| Baris | Perubahan |
|---|---|
| `:16–30` | impor `periksaTulis` (agentGuard) + 9 simbol dari `./kebijakanIsiWeb` |
| `:44` | `function kebijakan()` — **pembaca setelan tunggal**; semua tool memakai ini, bukan membaca sendiri |
| `:284` | `bacaHalamanMentah()` — jalur mentah lama (DOM statis + fetch cadangan) diberi nama jujur |
| `:352–356` | pembungkus `bacaHalaman(paneId, kb)` — tolak saat `izinIsiWeb !== true`, lalu `saringKeModel(await bacaHalamanMentah(paneId), kb)` |
| `:363` | `web_search` — hasil pencarian (= isi web) ditolak saat izin mati |
| `:410–437` | `web_fetch` — gerbang → `ambilIsiWeb` (`:429`) → strip tag → `potongKeluaran` (`:437`) |
| `:463` | `browser_open` — URL dijaga **sebelum** pane memuat |
| `:591` | `browser_read` — mengalir lewat `bacaHalaman` (izin diperiksa walau pane sudah terbuka) |
| `:706` | `browser_nav` cabang `goto` — gerbang yang sama |
| `:803–812` | `browser_download_url` — gerbang + `periksaTulis` + batas byte |
| `:839` | `system_browser_open` — URL dijaga sebelum dibuka di browser sistem |

---

## 3. Empat aturan yang diminta tugas — vonis + angka

| Aturan | Vonis | Angka / bukti nyata |
|---|---|---|
| (i) **Izin opt-in** (`kb.izinIsiWeb !== true` ⇒ tolak semua) | **TERTAMBAL** | `kebijakanIsiWeb.ts:97` bawaan tolak-semua; K01 izin mati menolak host yang **sudah** terdaftar; K03 setelan tanpa field = belum ada izin; **K25: izin mati ⇒ fetcher dipanggil `0×` untuk 4 URL** |
| (ii) **Daftar host / allowlist** (bawaan **TOLAK**) | **TERTAMBAL** | K05 host luar daftar ditolak; K06 daftar kosong = tolak semua; K08 `contoh.com.jahat.example` ditolak; K09 trik userinfo ditolak; K12–K14 IP privat/loopback/localhost ditolak; K15 port tak lazim ditolak; K27 kontrol positif 1× panggilan |
| (iii) **Batas ukuran keluaran** | **TERTAMBAL** | `BATAS_KARAKTER_KELUARAN=20000`; K19 30.000 → 20.037 (dipotong + penanda); K20 di bawah batas **tidak** dipotong; K21 permintaan 999.999 → clamp 20.000; K22 byte → clamp 8.388.608; K23/K24 bodi di atas batas **DITOLAK** (`kirim=0`) |
| (iv) **Tanpa jalur otomatis isi → model tanpa izin** | **TERTAMBAL** | `saringKeModel` (`:314`) + pembungkus `bacaHalaman` (`web.ts:352–356`) yang memeriksa izin **sebelum** `browser_pane_eval`; K28 izin mati → `kirim=0`; K29 izin hidup tetap dipotong (20.037). Fetch cadangan statis tetap **di dalam** `bacaHalamanMentah` (`web.ts:284`), jadi tetap di bawah gerbang. |

---

## 4. Bukti keluaran (verbatim, apa adanya)

### 4.1 `node scripts/uji-pane-browser.mjs` → exit 0

```
== (A) Bukti aturan pagar pane (implementasi acuan, node-only) ==
LULUS  C01..C19  (19/19)          ← blok (A) tidak berubah: 19/19 LULUS

LULUS 19/19

== (B) Jarak ke kode produk (berkas + baris nyata, bukan lulus/gagal) ==
ADA    src-tauri/src/web.rs:18 — lantai jaringan tunggal ADA (pub fn validate_outbound_url)
ADA    src-tauri/src/web.rs:27 — lantai skema http/https ADA
ADA    src-tauri/src/web.rs:41 — lantai port 80/443 ADA
ADA    src-tauri/src/web.rs:48 — blokir loopback/privat/link-local ADA
ADA    src-tauri/src/web.rs:123 — redirect TIDAK diikuti (max_redirects 0) ADA
TUNGGU src-tauri/src/web.rs:142 — MENUNGGU: bodi dibaca TANPA batas BYTE (read_to_string) — lapisan TS sudah memotong keluaran, lantai Rust masih menunggu (patch U3)
TAMBRG src-tauri/src/web.rs:241 — TERTAMBAL (lapisan TS): web_fetch sekarang lewat gerbang izin+allowlist di src/lib/zephyrTools/web.ts sebelum perintah ini dipanggil; lantai Rust sendiri tetap MENUNGGU allowlist (patch U1/U6)
ADA    src-tauri/src/browser_pane.rs:55 — pane hanya menerima http/https (cek awalan) ADA
TUNGGU src-tauri/src/browser_pane.rs:43 — MENUNGGU: browser_pane_open/nav TIDAK memanggil validate_outbound_url (lantai Rust) — jalur model sudah dicegah di TS, lantai dalam tetap menunggu
TAMBRG src-tauri/src/browser_pane.rs:197 — TERTAMBAL (lapisan TS): open/nav/goto kini lewat gerbangIsiKonten (izin+allowlist+skema+port) di web.ts; allowlist di dalam Rust tetap MENUNGGU (patch U4/U5)
TUNGGU src-tauri/src/browser_pane.rs:244 — MENUNGGU: browser_pane_eval menjalankan JS bebas -> bisa location.href = ... (BUTUH APP: event navigasi webview)
ADA    src-tauri/src/browser_pane.rs:331 — baca elemen terbatas (cursor) ADA
TAMBRG src/lib/zephyrTools/kebijakanIsiWeb.ts:198 — TERTAMBAL: modul kebijakan isi web ADA (343 baris, 6 fungsi gerbang) — satu titik keputusan untuk izin/allowlist/ukuran
TAMBRG src/lib/zephyrTools/kebijakanIsiWeb.ts:46 — TERTAMBAL: batas ukuran keluaran (karakter) ADA sebagai konstanta
TAMBRG src/lib/zephyrTools/kebijakanIsiWeb.ts:55 — TERTAMBAL: batas byte unduhan (bawa/maks) ADA sebagai konstanta
TAMBRG src/lib/zephyrTools/kebijakanIsiWeb.ts:97 — TERTAMBAL: keadaan bawaan = TOLAK SEMUA (izin opt-in, bukan opt-out)
TAMBRG src/lib/zephyrTools/kebijakanIsiWeb.ts:1 — TERTAMBAL: modul TANPA impor (tidak bisa menyentuh store/jaringan) — keputusan deterministik
TAMBRG src/lib/zephyrTools/web.ts:30 — TERTAMBAL: web.ts mengimpor modul kebijakan
TAMBRG src/lib/zephyrTools/web.ts (web_fetch):410 — TERTAMBAL: gerbang izin+allowlist+redirect sebelum jaringan, keluaran dipotong
TAMBRG src/lib/zephyrTools/web.ts (web_search):363 — TERTAMBAL: hasil pencarian (isi web) ditolak saat izin mati
TAMBRG src/lib/zephyrTools/web.ts (browser_open):443 — TERTAMBAL: URL dijaga sebelum pane memuat
TAMBRG src/lib/zephyrTools/web.ts (browser_read):579 — TERTAMBAL: isi pane disaring ke model (izin diperiksa walau pane sudah terbuka)
TAMBRG src/lib/zephyrTools/web.ts (browser_nav):669 — TERTAMBAL: goto memakai gerbang yang sama
TAMBRG src/lib/zephyrTools/web.ts (system_browser_open):825 — TERTAMBAL: URL dijaga sebelum dibuka di browser sistem
TAMBRG src/lib/zephyrTools/web.ts (browser_download_url):784 — TERTAMBAL: dua pagar (gerbang + periksaTulis) dan batas byte
TAMBRG src/lib/zephyrTools/web.ts:356 — TERTAMBAL: pembungkus bacaHalaman menyaring isi pane sebelum sampai ke model
TAMBRG src/lib/zephyrTools/web.ts:428 — TERTAMBAL: keluaran web dipotong ke batas karakter di jalur produk
TANDAI src/lib/zephyrTools/web.ts — TANDAI: aksi pane nyata = [web_search, web_fetch, browser_open, browser_read, browser_click, browser_type, browser_nav, browser_list, browser_close, browser_download_url, system_browser_open] — perlu-review-gerbang-berkas: [browser_download_url] (sudah dua pagar, lihat baris di atas)

== Ringkasan ==
kasus pagar pane : 19/19 LULUS
jaringan nyata   : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)
kebijakan isi web: TERTAMBAL 17, MENUNGGU 3, CELAH 0 (bukti per baris di atas)
bukti tambalan   : node scripts/uji-pane-browser-kebijakan.mjs (kode produk dibundel esbuild, 29 kasus)
ANGKA BATAS      : byte-bawa=2097152  byte-maks=8388608  hop-redirect=5  halaman-redirect=5  port-sah=default,80,443
HASIL: aturan PAGAR PANE LULUS (exit 0). Kebijakan isi web bagian (B) TERTAMBAL di lapisan TS (17 temuan) — sisa 3 MENUNGGU di lapisan Rust, tercatat di docs/USULAN-PANE-BROWSER.md.
```

Catatan kejujuran: baris `HASIL:` **yang lama** berbunyi "Ini TIDAK berarti kode produk sudah aman —
celah di bagian (B) menunggu patch". Baris itu sekarang diganti vonis per butir di atas, karena
celah (B) yang bisa ditambal dari sisi TS **sudah** ditambal; yang tersisa adalah lantai Rust.

### 4.2 `node scripts/uji-pane-browser-kebijakan.mjs` → exit 0 (29 kasus, keluaran penuh di §7)

```
-- Ringkasan kasus --
  kasus dari kode produk (bundel esbuild, bukan salinan aturan): 29 kasus, 29 lulus
  IZIN: 4/4 lulus
  DAFTAR: 3/3 lulus
  NEGATIF: 11/11 lulus
  UKURAN: 6/6 lulus
  JARINGAN: 5/5 lulus

== Ringkasan ==
modul produk diuji  : src/lib/zephyrTools/kebijakanIsiWeb.ts (bundel esbuild 6349 byte, dijalankan)
pemasangan diperiksa: src/lib/zephyrTools/web.ts (845 baris, 7 tool web/browser)
kasus kebijakan     : 29 (izin 4/4, daftar 3/3, negatif 11/11, ukuran 6/6, jaringan 5/5)
failsafe "nol kirim": izin mati -> fetcher 0x untuk 4 URL, saringKeModel kirim=0
jaringan benar-benar: fetcher dipanggil 1x pada kontrol positif, 0x fetch global
determinisme        : IDENTIK
sisa di luar cakupan: lapisan Rust (web.rs/browser_pane.rs) -> docs/USULAN-PANE-BROWSER.md
periksa             : 29 kasus + 15 pemeriksaan struktur = 44; lulus 44, gagal 0
HASIL: LULUS (exit 0) — 29 kasus kebijakan + 15 pemeriksaan struktur
```

### 4.3 Typecheck & harness lain yang disentuh

```
$ npx tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0            (0 galat, keluaran 0 byte)

$ node scripts/uji-pane-browser.mjs ; echo "EXIT=$?"
EXIT=0                (19/19 LULUS — sama sebelum & sesudah tambalan)

$ node scripts/uji-pane-browser-kebijakan.mjs ; echo "EXIT=$?"
EXIT=0                (29 kasus + 15 pemeriksaan struktur)

$ node scripts/uji-fetch-web-rencana.mjs ; echo "EXIT=$?"
EXIT=0                (27/27 LULUS, berkas ini TIDAK disentuh item ini)

$ node scripts/uji-pane-browser-kebijakan.mjs | cmp dengan jalankan kedua
IDENTIK byte-per-byte  (determinisme, bukan klaim)
```

---

## 5. Sisa yang tidak bisa ditambal dari sini (peta ke `docs/USULAN-PANE-BROWSER.md`)

| Sisa | Berkas:baris | Kenapa menunggu |
|---|---|---|
| Batas byte **sebelum** bodi tiba (U3) | `src-tauri/src/web.rs:142` | Butuh patch Rust + kompilasi; harness node tidak menjalankan Rust |
| Allowlist di lantai Rust untuk fetch (U1/U6) | `src-tauri/src/web.rs:241` | idem |
| Lantai jaringan pane (U4) | `src-tauri/src/browser_pane.rs:43` | idem (Rust) |
| Allowlist `goto` di dalam Rust (U5) | `src-tauri/src/browser_pane.rs:197` | idem (Rust) |
| Escape navigasi `browser_pane_eval` (U9) | `src-tauri/src/browser_pane.rs:244` | **BUTUH APP**: butuh event navigasi webview hidup untuk dibuktikan |
| Persistensi allowlist (config vs state) & bentuk UI Settings | — | keputusan desain pemilik; **tidak dikarang** di sini |

Semua baris registrasi/pendaftaran yang menyentuh **berkas bersama** (mis. `src-tauri/src/main.rs`,
`src/lib/mcpClient.ts`, katalog tool) **tidak** disunting item ini; kalau kelak diperlukan, bentuknya
ditulis sebagai usulan baris-registrasi di `docs/USULAN-PANE-BROWSER.md`, bukan langsung ditambal.

---

## 6. Catatan kejujuran (hal yang tidak dibuktikan di sini)

1. **`audit-katalog-tool.mjs` exit 1 — BUKAN dari tambalan ini.** Kegagalannya adalah
   `langit-langit per giliran 26 > target 20`, yang dihitung **hanya** dari `catalog.ts`
   (`TOOL_DIKIRIM_SELALU` × `AKTIF_AWAL`); tidak satu pun berkas item ini (`web.ts`,
   `kebijakanIsiWeb.ts`) mengubah angka itu. Dibuktikan dengan membandingkan `catalog.ts` versi
   `HEAD` (`git show`) vs worktree memakai fungsi `entriBlok`/`alatTerkirim` yang sama:

   ```
   catalog.ts HEAD    : katalog=65 aktif-default=60 DIKIRIM_SELALU=25 irisan=25
   catalog.ts worktree: katalog=67 aktif-default=62 DIKIRIM_SELALU=26 irisan=26
   => BERUBAH oleh penyunting catalog.ts (bukan berkas item ini): 25 -> 26
   ```

   `catalog.ts` tampak sebagai perubahan lane lain (`git diff` menunjukkan berkas itu termodifikasi
   di worktree, sementara `git diff` berkas item ini hanya `web.ts`).
2. Yang diuji harness adalah **perilaku kode produk hasil bundel esbuild** (`kebijakanIsiWeb.ts`
   dijalankan), bukan salinan aturan di dalam skrip uji — tapi tetap **node-only**: tidak ada app,
   tidak ada webview, tidak ada Rust. Bukti runtime lapisan Rust tetap `MENUNGGU`.
3. `scripts/uji-pane-browser.mjs` menguji **aturan pagar acuan** di blok (A); kelulusan 19/19 di
   blok itu **tidak** berarti kode produk aman — blok (B) di atas yang menyatakan jarak sebenarnya.
4. Tidak ada berkas yang di-`git add`/`git commit`. Berkas generator
   (`src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts`) tidak disentuh. Harness CDP (`:9223`)
   tidak dijalankan.

---

## 7. Lampiran — keluaran penuh `node scripts/uji-pane-browser-kebijakan.mjs` (verbatim)

```
== Kasus kebijakan (kode produk: src/lib/zephyrTools/kebijakanIsiWeb.ts) ==
  [LULUS] K01 (IZIN) izin MATI menolak host yang SUDAH terdaftar (opt-in, bukan opt-out)
          ok=false, alasan=izin-isi-web-mati
  [LULUS] K02 (IZIN) izin HIDUP + host terdaftar diloloskan, host/url dikembalikan
          ok=true, host=contoh.com, url=https://contoh.com/artikel
  [LULUS] K03 (IZIN) setelan tanpa field izin isi web dibaca sebagai "belum ada izin"
          izinIsiWeb=false, allowlist=0
  [LULUS] K04 (IZIN) field setelan rusak tidak memperluas izin (allowlist entri non-string dibuang)
          izinIsiWeb=false, allowlist=[contoh.com], batasByte=2097152, batasKarakter=20000
  [LULUS] K05 (DAFTAR) host di LUAR daftar DITOLAK (izin hidup)
          alasan=host-luar-allowlist:jahat.example
  [LULUS] K06 (DAFTAR) daftar KOSONG = tolak semua (bukan "izinkan semua")
          alasan=host-luar-allowlist:contoh.com
  [LULUS] K07 (DAFTAR) subdomain SAH dari entri daftar diloloskan (batas titik)
          ok=true, host=docs.contoh.com
  [LULUS] K08 (NEGATIF) host menempel di akhiran entri ("contoh.com.jahat.example") DITOLAK
          ok=false, alasan=host-luar-allowlist:contoh.com.jahat.example
  [LULUS] K09 (NEGATIF) trik userinfo ("contoh.com@jahat.example") DITOLAK - host asli = sesudah @
          alasan=host-luar-allowlist:jahat.example
  [LULUS] K10 (NEGATIF) skema file: DITOLAK
          alasan=skema-terlarang:file:
  [LULUS] K11 (NEGATIF) skema javascript: DITOLAK
          alasan=skema-terlarang:javascript:
  [LULUS] K12 (NEGATIF) IPv4 privat DITOLAK walau izin hidup
          alasan=ip-privat:192.168.1.10
  [LULUS] K13 (NEGATIF) IPv6 loopback DITOLAK
          alasan=ip-privat:[::1]
  [LULUS] K14 (NEGATIF) localhost DITOLAK (dev-server tidak bisa dijangkau agen)
          alasan=nama-lokal:localhost
  [LULUS] K15 (NEGATIF) port tak lazim DITOLAK (hanya default/80/443)
          alasan=port-tak-lazim:8443
  [LULUS] K16 (NEGATIF) argumen kosong/undefined DITOLAK dengan alasan, bukan lemparan
          undefined=tanpa-argumen, kosong=tanpa-argumen
  [LULUS] K17 (NEGATIF) redirect ke host di luar daftar DITOLAK (hop diperiksa ulang)
          alasan=hop-1:host-luar-allowlist:jahat.example
  [LULUS] K18 (NEGATIF) rantai redirect > 5 hop DITOLAK
          alasan=batas-redirect-terlampaui:7
  [LULUS] K19 (UKURAN) isi 30.000 karakter DIPOTONG ke batas keras 20.000 + penanda
          asli=30000, batas=20000, dipotong=true, panjang hasil=20037 (diharap 20037)
  [LULUS] K20 (UKURAN) isi di bawah batas TIDAK dipotong (tidak ada penanda palsu)
          dipotong=false, panjang=19999
  [LULUS] K21 (UKURAN) permintaan batas karakter di atas batas keras di-clamp ke 20.000
          permintaan=999999, batas berlaku=20000
  [LULUS] K22 (UKURAN) batas byte di-clamp ke 8 MiB
          permintaan=99999999, batas berlaku=8388608
  [LULUS] K23 (UKURAN) bodi di atas batas byte DITOLAK (bukan dipotong diam-diam)
          alasan=bodi-terlalu-besar:2000>1024
  [LULUS] K24 (UKURAN) isi yang diterima melebihi batas byte kebijakan DITOLAK di ambilIsiWeb
          alasan=bodi-terlalu-besar:5000>1024, kirim=0, fetcher=1x
  [LULUS] K25 (JARINGAN) IZIN MATI = NOL panggilan jaringan untuk 4 URL (bukan sekadar hasil kosong)
          fetcher dipanggil=0x dari 4 URL, semua tolak=true
  [LULUS] K26 (JARINGAN) host di luar daftar = NOL panggilan jaringan (gerbang mendahului jaringan)
          fetcher=0x, alasan=host-luar-allowlist:jahat.example
  [LULUS] K27 (JARINGAN) KONTROL POSITIF: host terdaftar + izin hidup = tepat 1 panggilan
          fetcher=1x, ok=true, teks="isi halaman asli"
  [LULUS] K28 (JARINGAN) pintu isi -> model (`saringKeModel`) menolak saat izin mati: kirim = 0
          ok=false, kirim=0, alasan=izin-isi-web-mati
  [LULUS] K29 (JARINGAN) pintu isi -> model tetap memotong saat izin hidup
          ok=true, panjang=20037 (diharap 20037)

-- Sumber & pemasangan (bukti statis: berkas + baris) --
  [LULUS] S1 modul kebijakan MURNI: tanpa impor sama sekali (tidak bisa menyentuh store/jaringan)  —  src/lib/zephyrTools/kebijakanIsiWeb.ts 14401 byte
  [LULUS] S2 modul kebijakan tidak memanggil jaringan/invoke/openUrl  —  tidak ada fetch/invoke/openUrl
  [LULUS] S3 permukaan API kebijakan lengkap  —  11 fungsi
  [LULUS] S4 konstanta batas ada dan angkanya cocok laporan  —  byte 2097152/8388608, karakter 20000, hop 5
  [LULUS] S5 setiap tool web/browser yang menyentuh jaringan punya gerbang isi web  —  7 tool
  [LULUS] S6 web.ts mengimpor modul kebijakan  —  src/lib/zephyrTools/web.ts:30
  [LULUS] S7 web.ts punya pembaca kebijakan tunggal  —  src/lib/zephyrTools/web.ts:44 function kebijakan()
  [LULUS] S8 web_fetch memakai gerbang+jaringan (ambilIsiWeb) dengan barisnya  —  src/lib/zephyrTools/web.ts:429
  [LULUS] S9 browser_read memakai pintu isi -> model (bacaHalaman -> saringKeModel)  —  pemanggil src/lib/zephyrTools/web.ts:591, pembungkus 352, pintu 356
  [LULUS] S10 browser_download_url memakai periksaTulis (pagar tulis) sebelum tulis  —  src/lib/zephyrTools/web.ts:805
  [LULUS] S11 unduhan dibatasi byte (batasByteBerlaku + batasiByte)  —  batasByteBerlaku + batasiByte ada di blok unduhan
  [LULUS] S12 bundel hasil nyata memuat gerbang (bukan mati karena tree-shaking)  —  bundel 6349 byte

-- Determinisme & pagar harness --
  [LULUS] D1 keluaran deterministik (dua jalankan identik)  —  IDENTIK byte-per-byte
  [LULUS] D2 tanpa jaringan: fetch tidak pernah dipanggil selama uji  —  globalThis.fetch dipanggil 0x
  [LULUS] D3 harness ini tidak menyentuh CDP (port 9223)  —  tanpa CDP, hanya node + esbuild
```
