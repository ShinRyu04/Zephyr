# LAPORAN - ZEPH-TAHU-100P (hafal proyek 100%) + ZEPH-RETRIEVAL-OTOMATIS (retrieval otomatis)

Status: **SELESAI DIUKUR** — semua angka di bawah adalah keluaran nyata dua harness di
`D:/Zephyr`, bukan perkiraan. Berkas bukti mentah:
`scratch/uji-tahu-100p/keluaran.txt`, `scratch/uji-tahu-100p/hasil.json`,
`scratch/uji-retrieval-otomatis/keluaran.txt`, `scratch/uji-retrieval-otomatis/hasil-1.json`,
`scratch/uji-retrieval-otomatis/hasil-2.json`, `scratch/uji-retrieval-otomatis/ringkas.json`.

Item: ZEPH-TAHU-100P + ZEPH-RETRIEVAL-OTOMATIS (2026-10-14), branch
`feat/ai-panel-vscode-layout`. Kode produk **tidak diubah** (read-only); perubahan hanya
diusulkan di `docs/USULAN-RETRIEVAL-OTOMATIS.md`.

## 1. Cara mengukur (harness, bukan klaim)

| Harness | Yang diukur | Verdict nyata |
|---|---|---|
| `scripts/uji-tahu-100p.mjs` | jawaban dari BLOK INTI vs PERLU RETRIEVAL, ambang <= 2.000 token, pelacakan sumber, kueri luar-Zephyr | **59/59 diperiksa, LULUS** |
| `scripts/uji-retrieval-otomatis.mjs` | kueri tidak lazim, batas hasil, duplikat, tidak ada nilai kunci, determinisme, jalur otomatis di kode produk | **29/29 diperiksa, LULUS** |

Keduanya membundel **modul yang dipakai aplikasi** (`src/lib/systemPrompt.ts`,
`src/lib/zephyrCari.ts`, `src/lib/zephyrDokumen.ts`, `src/lib/zephyrFakta.ts`) lewat
esbuild lalu menjalankannya di Node — jadi yang diuji kode produk, bukan salinan logika
di harness. Keduanya hanya MEMBACA berkas produk.

## 2. Angka nyata - `scripts/uji-tahu-100p.mjs`

Indeks yang diuji: **6.212 entri**, app `1.1.13`, source hash `f83cc022d0c620db`.
Peta kategori: `bridge 1, dokumen 176, ekstensi 17, kode 404, label 3023, layar 1976,
menu 122, panel 22, perintah 179, pintasan 66, port 4, seksi 31, setelan 124, tool 67`.

### 2.1 Ambang blok inti

| Pemeriksaan | Angka nyata | Batas | Putusan |
|---|---|---|---|
| `AMBANG_TOKEN_INTI` dibaca dari `src/lib/systemPrompt.ts` | **2.000** token | — | OK (tidak di-hardcode) |
| Panjang blok inti | **7.812 char = 1.953 token** | <= 2.000 token | **OK, sisa 47 token** |
| Rincian | `faktaInti` 1.747 tok + `blokLarangan` 182 tok + `kepalaPotret` 24 tok | — | OK |
| Blok inti vs generated penuh | 6.986 char < `FAKTA_ZEPHYR` 7.950 char | — | OK (on-demand benar-benar dipotong) |

### 2.2 Cakupan 21 pertanyaan nyata

| Jalur jawaban | Jumlah | Arti |
|---|---|---|
| Terjawab dari **BLOK INTI** | **10** | bukti literalnya ada di blok inti 1.953 tok |
| **Perlu retrieval** | **10** | bukti TIDAK ada di blok inti, tapi ada di `suntikanIndeks()` otomatis giliran itu |
| Dari **kepala suntikan** (meta) | **1** | "berapa jumlah entri indeks" dijawab kepala blok (`Index 6212 entries …`) |
| **Total** | **21** | minimal 12 terpenuhi |

Sepuluh yang terjawab **dari blok inti** (bukti literal, dicek ada/tidak di blok inti):

| # | Pertanyaan | Bukti di blok inti |
|---|---|---|
| 1 | berapa port default MCP server | `port=9222` |
| 2 | pintasan buka Settings | `Ctrl+, = Open Settings` |
| 3 | shortcut toggle panel bawah | `Ctrl+J = Toggle bottom panel` |
| 4 | di mana settings.json disimpan | `%APPDATA%\zephyr\settings.json` |
| 5 | tab apa saja di panel bawah | `problems, output, debug, terminal, ports, ai, subagents` |
| 6 | default `agents.maxPanes` | `maxPanes=6` |
| 7 | tema bawaan | `theme: current=zephyr-dark` |
| 8 | jumlah setting key bawaan | `ALL 124 setting keys` |
| 9 | jumlah shortcut bawaan | `34 default shortcuts` |
| 10 | `zephyr_self` itu tool apa | `` `zephyr_self` `` |

Sepuluh yang **perlu retrieval** (bukti TIDAK ada di blok inti; `suntikanIndeks()`
otomatis memuatnya — jadi tanpa model memanggil tool apa pun):

| # | Pertanyaan | Bukti yang muncul dari suntikan otomatis | Panjang suntikan / entri | Entri teratas (bisa dilacak) |
|---|---|---|---|---|
| 11 | folder logs Zephyr | `zephyr-YYYY-MM-DD.log` | 1.070 char / 4 | `[dokumen] ARCHITECTURE.md#6. Layout data user` |
| 12 | tool yang dikirim selalu tiap giliran | `src/lib/zephyrTools/catalog.ts` | 1.055 char / 4 | `[kode] src/lib/zephyrTools/catalog.ts` |
| 13 | id perintah palet atur model AI | `ai.models` | 1.559 char / 5 | `[perintah] AI: Configure Models & API Keys` |
| 14 | ekstensi bawaan | `zephyr.ikon-bahasa` | 1.542 char / 5 | `[ekstensi] zephyr.ikon-bahasa` |
| 15 | berkas `zephyrCari` | `src/lib/zephyrCari.ts` | 1.296 char / 1 | `[kode] src/lib/zephyrCari.ts` |
| 16 | cara build rilis | `tauri:build` | 1.090 char / 1 | `[dokumen] docs/ATURAN-KERJA.md#3. Build rilis` |
| 17 | perintah test | `PASTIKAN 0 error` | 1.519 char / 5 | `[label] Semua perintah dijalankan tanpa interupsi` |
| 18 | perintah palet toggle terminal | `terminal.toggle` | 898 char / 4 | `[menu] Toggle Terminal` |
| 19 | fungsi `cariFakta` | `pecahKueri` | 1.104 char / 1 | `[kode] src/lib/zephyrCari.ts` |
| 20 | jumlah tool bawaan | `src/lib/zephyrTools/builtins.ts` | 1.278 char / 4 | `[kode] src/lib/zephyrTools/builtins.ts` |

Kesimpulan (a): **21/21 pertanyaan punya jalur jawaban** — 10 dari blok inti (yang tetap
1.953 token), 10 dari retrieval otomatis yang jalan sendiri, 1 dari meta indeks. Model
tidak perlu "ingat" memanggil `zephyr_self` untuk satu pun dari 21 itu.

### 2.3 Pelacakan sumber

| Pemeriksaan | Angka nyata | Putusan |
|---|---|---|
| Berkas di `FAKTA_ZEPHYR_SUMBER` | **13**, semuanya ada di disk | OK |
| Entri teratas tiap pertanyaan retrieval bisa dilacak | 10/10: kuncinya ada di `src/lib/zephyrIndeks.ts` DAN berkas nyatanya ada di disk (`existsSync`) | OK |
| Blok generated memuat identitas aplikasi | 1/1 | OK |

### 2.4 Pertanyaan di luar Zephyr (retrieval tidak boleh dipaksa)

| Kueri | Entri | `hitungCocok` | Isi suntikan | Putusan |
|---|---|---|---|---|
| `resep rendang padang yang empuk` | 0 | 0 | 1.002 char, mengaku tidak ada yang cocok; nama asing `rendang,padang,empuk` | OK |
| `kenapa langit berwarna biru` | 0 | 0 | 989 char, mengaku tidak ada cocok; `langit,berwarna` | OK |
| `bagaimana cara belajar gitar akustik` | 0 | 0 | 997 char; `belajar,gitar,akustik` | OK |
| `harga bitcoin hari ini berapa` | 0 | 0 | 985 char; `harga,bitcoin` | OK |

Empat-empatnya **0 entri / 0 kecocokan**: retrieval tidak dipaksa, dan blok suntikan
jujur mengatakan tidak ada yang cocok (bukan mengarang entri).

## 3. Angka nyata - `scripts/uji-retrieval-otomatis.mjs`

Konstanta nyata yang dibaca dari modul yang diuji (bukan diketik ulang di harness):

| Modul | Batas nyata |
|---|---|
| `zephyrCari` | `BATAS_HASIL_BAWAAN` **8**, `BATAS_HASIL_MAKS` **40**, `BATAS_KARAKTER_HASIL` **6000** |
| `zephyrCari` (suntikan) | `BATAS_HASIL_SUNTIK` **10**, `BATAS_KARAKTER_SUNTIK` **1200** |
| `zephyrDokumen` | `BATAS_HASIL_BAWAAN` **8**, `BATAS_HASIL_MAKS` **30**, `BATAS_KARAKTER_HASIL` **6000**, `BATAS_POTONGAN` **240** |
| `zephyrDokumen` (suntikan) | `BATAS_HASIL_SUNTIK` **6**, `BATAS_KARAKTER_SUNTIK` **1500** |

### 3.1 Kueri tidak lazim (20 kueri)

| Kategori kueri | Contoh nyata | Hasil nyata |
|---|---|---|
| salah tulis 1 huruf | `zepyr car` | 8 entri, cara `longgar`, teratas `[dokumen] AGENTS.md#2. Cara kerja`; `hitungCocok`=0; nama asing `zepyr,car` |
| kapital semua | `TEMA GELAP ZEPHYR` | 2 entri, cara `ketat`, teratas `[label] Tema mengubah UI, editor, dan terminal…` |
| emoji + kata nyata | `🔥 tema gelap` | 4 entri, cara `ketat` |
| kalimat utuh sehari-hari | `cara pakai zephyr_self buat nyari setelan` | 2 entri, cara `nama`, teratas `[tool] zephyr_self` |
| sinonim/parafrase | `aku mau ngatur api key model AI` | 8 entri, cara `nama`, teratas `[label] Add an API key for {name}…` |
| frasa tidak lazim | `shortcut keyboard untuk split editor vertikal` | 2 entri, cara `longgar`, teratas `[layar] KeybindingsEditor` |
| id perintah persis | `terminal.toggle` | 2 entri, cara `ketat`, teratas `[perintah] Terminal: Toggle Panel` |
| label persis | `AI: Configure Models & API Keys` | 3 entri, cara `ketat`, teratas `[perintah] AI: Configure Models & API Keys` (skor 1000) |
| jalur berkas | `src/lib/zephyrTools/catalog.ts` | 1 entri, cara `ketat`, teratas `[kode] src/lib/zephyrTools/catalog.ts` (skor 1000) |
| satu huruf besar | `Z` | 8 entri, cara `ketat`, `hitungCocok`=3.160; teratas `[label] Zen Mode` |
| mirip injection | `setelan' OR 1=1--` | 4 entri, cara `longgar`, teratas `[layar] sav-tulis-setelan`; nama asing `1--` |
| tanda baca saja | `!!! ??? ;;;` | **0 entri** |
| string kosong | `` (kosong) | **0 entri** |
| spasi saja | `     ` | **0 entri** |
| kata ngawur | `xxx yyy zzz` | **0 entri**, asing `xxx,yyy,zzz` |

Wajib-ada **9 kueri** semuanya benar-benar memberi hasil; wajib-kosong **4 kueri**
semuanya benar-benar 0 entri. 20 kueri >= minimal 16.

### 3.2 Batas hasil (semua 20 kueri diperiksa)

| Pemeriksaan | Angka nyata | Putusan |
|---|---|---|
| `cariFakta` tanpa opsi <= 8 entri | 20/20 kueri patuh (0 pelanggaran) | OK |
| `cariFakta({batas: 9999})` dipotong <= 40 | 20/20 (0 pelanggaran) | OK |
| `formatHasil()` <= 6.000 char | 20/20, bawaan maupun batas 9999 | OK |
| Anggaran `suntikanIndeks()` <= 1.200 char dan <= 10 entri | 20/20 patuh; anggaran terpanjang **303 char** | OK |
| `cariDokumen` <= 8 default / <= 30 maks / format <= 6.000 char | 20/20 | OK |
| Satu potongan dokumen <= 240 char | 20/20 | OK |
| `suntikanDokumen()` <= 1.500 char | 20/20 | OK |

Catatan terukur (bukan kegagalan, tapi layak dicatat):
- Blok suntikan **total** (kepala + meta + entri + **penutup**) pernah mencapai
  **1.539 char** di uji ini dan **1.559 char** di uji TAHU-100P, melewati
  `BATAS_KARAKTER_SUNTIK` = 1.200 — karena penutup ditambahkan SESUDAH anggaran
  (`src/lib/zephyrCari.ts:559-579`). Lihat usulan patch di dokumen usulan.
- Entri **mentah** `cariFakta` melewati 6.000 char pada **4 kueri**; batas 6.000
  ditegakkan di `formatHasil()`, bukan di `cariFakta()`. Semua pemanggil produk
  (`src/lib/zephyrTools/builtins.ts:2333`, `src/lib/zephyrTools/zephyrSelf.ts:379,453`)
  memakai `formatHasil()`, jadi tidak ada keluaran tak-terbatas yang bocor ke model.

### 3.3 Duplikat, nilai kunci, determinisme

| Pemeriksaan | Angka nyata | Putusan |
|---|---|---|
| Kunci `kategori|kunci` unik | 15 kueri yang berhasil, **0 duplikat** | OK |
| Lokasi `berkas:baris` unik | 10 kueri dokumen, **0 duplikat** | OK |
| Pola kredensial dipindai | **10 pola** (`sk-*`, `ghp_*`, `AKIA*`, `xoxb-*`, `Bearer …`, PEM private key, JWT, `apiKey="…"`, `password="…"`, `token="…"`) → **0 temuan** | OK |
| Determinisme | dua kali jalankan anak: **byte-identik**, sha256 `72d3c69c33ac972b…` | OK |

Satu-satunya kemunculan kata "kunci" yang terdeteksi adalah **nama berkas**
`settings.json` / `secrets.json` yang memang bagian dari fakta produk (mis. "berkas
setelan disimpan di `%APPDATA%\zephyr\`"), **bukan nilai kredensial** — tidak ada nilai
kunci, token, atau kata sandi yang ikut di keluaran.

### 3.4 Jalur OTOMATIS benar-benar terpasang?

| Pemeriksaan | Angka nyata | Putusan |
|---|---|---|
| `suntikanIndeks(` dipanggil (baris komentar tidak dihitung) | **1x**: `src/lib/systemPrompt.ts:1071` (0x di `aiStore.ts`) | OK — retrieval indeks jalan otomatis tanpa tool call |
| `suntikanDokumen()` bekerja saat dipanggil langsung | **20/20 kueri** berisi keluaran nyata (bundel `e69ed58c41a7a19b`, 41 berkas) | OK |
| `suntikanDokumen(` dipanggil otomatis di kode produk | **0x** | **CELAH** (lihat bagian 4) |

## 4. Celah yang masih terbuka (jujur)

1. **Lapis dokumen belum tersambung ke prompt.** `suntikanDokumen()` terdefinisi penuh di
   `src/lib/zephyrDokumen.ts` dan terbukti memberi hasil nyata (20/20 kueri), tapi
   **0x dipanggil** dari `src/lib/systemPrompt.ts` / `src/lib/aiStore.ts`. Isi dokumen
   bundel (41 berkas, 176 entri kategori `dokumen`) hanya bisa dicapai lewat pemanggilan
   langsung (tool `zephyr_self`) — padahal justru lapis itulah yang memuat prosa dan
   kutipan berbaris. Ini juga dicatat sendiri oleh `docs/BUNDEL-DOKUMEN.md` §8.
   Usulan patch ada di `docs/USULAN-RETRIEVAL-OTOMATIS.md` (U1).
2. **Penutup blok suntikan di luar anggaran karakter.** `BATAS_KARAKTER_SUNTIK` = 1.200
   hanya mengikat kepala + meta + entri; penutup (~600-700 char) ditambahkan setelahnya,
   sehingga blok nyata sampai **1.559 char** (terukur). Anggarannya jujur tapi namanya
   menyesatkan kalau dibaca sebagai "blok <= 1.200". Usulan U2.
3. **Error teks (salah tulis) tidak dikoreksi.** `zepyr car` -> 8 entri dengan cara
   `longgar` (cocok lewat potongan kata `car`→`cara`), `hitungCocok`=0, dua kata
   dilaporkan asing. Model dapat PETUNJUK "ini cuma cocok sebagian", tapi tidak mendapat
   koreksi ejaan — jadi pertanyaan "zephyr carte" bergantung pada model menafsir sendiri.
   Tidak ada stemming/sinonim (`docs/BUNDEL-DOKUMEN.md` §8 menyebutnya pilihan sadar).
4. **Kueri mirip injection tetap memberi entri longgar.** `setelan' OR 1=1--` -> 4 entri
   cara `longgar` (teratas `[layar] sav-tulis-setelan`). Tidak berbahaya (tidak dieksekusi,
   hanya pencocokan teks deterministik) tapi patut dicatat: kueri aneh tidak "ditolak",
   ia dicocokkan sebagian.
5. **Blok inti hanya punya sisa 47 token.** 1.953 dari 2.000 token (97,7%). Setiap
   penambahan fakta inti baru **wajib** lewat kelas kondisional atau memotong yang ada —
   tidak ada ruang lagi. Harness `scripts/uji-blok-inti.mjs` akan menggagalkan build kalau
   lewat.
6. **Retrieval bergantung artefak hasil generate.** Indeks 6.212 entri
   (`src/lib/zephyrIndeks.ts`) dan bundel dokumen dipanen saat build. Kode/dokumen yang
   berubah tapi artefaknya belum di-regenerate **tidak bisa ditemukan**; lane ini tidak
   meregenerasi apa pun (aturan: jangan regen indeks/fakta/bundel). Pertanyaan soal kode
   yang baru ditulis di giliran ini belum tentu terjawab dari retrieval.
7. **Belum ada bukti percakapan model nyata.** Kedua harness membuktikan **teks yang
   dikirim ke model** memuat bukti yang benar (dan bahwa retrieval jalan otomatis), tapi
   belum membuktikan model benar-benar memakai blok itu di jawaban akhir. Itu butuh
   aplikasi hidup (CDP) — **BUTUH APP**, di luar jangkauan harness statis ini.
8. **Kategori pertimbangan:** pertanyaan platform (`apakah zephyr bisa jalan di mac`) ->
   8 entri cara `longgar`, semua cuma nyerempet, kata `mac` dilaporkan asing. Jawaban
   jujurnya "tidak ada di indeks", tapi model masih menerima 8 baris yang bisa
   disalahartikan sebagai dukungan macOS/Linux.

## 5. Cara menjalankan ulang

```bash
cd D:/Zephyr
node scripts/uji-tahu-100p.mjs            # 59/59, exit 0
node scripts/uji-retrieval-otomatis.mjs   # 29/29, exit 0
node node_modules/typescript/lib/tsc.js --noEmit -p D:/Zephyr   # jalur aman di MSYS
```

Bukti mentah ditulis ke `scratch/uji-tahu-100p/` dan `scratch/uji-retrieval-otomatis/`
(`keluaran.txt`, `hasil.json` / `hasil-1.json` + `hasil-2.json`, `ringkas.json`).
