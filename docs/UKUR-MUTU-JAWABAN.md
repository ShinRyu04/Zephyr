# Ukur Mutu Jawaban Zeph

Rubrik untuk menilai **jawaban Zeph yang sudah terjadi**, bukan jawaban yang kita
karang sendiri. Alatnya: `scripts/ukur-mutu-jawaban.mjs`.

## Aturan yang tidak bisa dilanggar

1. Yang diukur hanya jawaban tersimpan di `docs/uji-jawaban/*.md`.
2. Tidak ada berkas bukti = tidak ada penilaian. Skrip mencetak **TIDAK DIUJI**
   dan keluar dengan kode `2`. Ia **menolak** menyimpulkan LULUS maupun MERAH.
3. Butir yang butuh jaringan/provider nyata tetapi belum punya berkas jawaban
   dicetak `TIDAK DIUJI`, bukan "lulus".
4. `LULUS` hanya keluar kalau ada berkas jawaban **dan** semua butir yang bisa
   diukur lolos.
5. Jawaban yang dikarang mock **tidak dihitung** sebagai bukti. Mock boleh
   dipakai untuk menguji alat, bukan untuk mengklaim mutu Zeph.

## Cara menyediakan bukti

1. Jalankan app Zephyr dengan CDP aktif (`scripts/jalankan-zephyr.cmd`).
2. `node scripts/cek-pengetahuan-2lapis.mjs` — harness ini mencetak blok
   `--- jawaban Zeph ---`.
3. Salin jawaban itu **apa adanya** ke `docs/uji-jawaban/<nama>.md`:

```
<!-- pertanyaan: bandingkan setelan editor dan terminal -->
<!-- diminta: tabel -->
<!-- bahasa: id -->
<!-- gaya: short -->
<!-- acuan: A9 -->
<!-- sumber: app-live -->

| setelan | grup | efek |
| --- | --- | --- |
| ... |
```

Metadata yang dibaca: `pertanyaan`, `diminta` (`tabel`, `daftar`, `tabel daftar`),
`bahasa` (`id`/`en`), `gaya` (`short`/`normal`/`detail`), `acuan` (kode `A1`–`A12`,
mengisi butir R7), `sumber`.

## 12 pertanyaan acuan (`--acuan`)

Acuan tetap tentang **Zephyr sendiri**, supaya jawaban dinilai lawan data repo,
bukan lawan selera. Setiap `harap` **diverifikasi ke data nyata**
(`src/lib/zephyrFakta.ts` + `src/lib/zephyrIndeks.ts`, versi app 1.1.13); kalau
harapannya tidak ada di data, yang dicetak **RUBRIK CACAT** — alatnya yang salah,
bukan jawabannya.

| Kode | Kategori | Pertanyaan | Nilai yang harus benar |
| --- | --- | --- | --- |
| A1 | angka indeks | Port bawaan server MCP Zephyr, dan port debug WebView2/CDP? | `9222`, `9223` |
| A2 | angka + lokasi berkas | Port dev server UI, dan dari berkas mana nilainya datang? | `5173`, `vite.config.ts` |
| A3 | angka setelan | Nilai bawaan `agents.maxPanes` dan grupnya? | `maxPanes`, `6`, `agents` |
| A4 | lokasi berkas | Di jalur mana setelan global disimpan? | `settings.json`, `%APPDATA%` |
| A5 | cara buka Settings | Bagaimana user membuka Settings, lewat pintasan apa? | `Ctrl+,` |
| A6 | apa yang baru | Versi yang berjalan berapa, di mana user melihatnya? | `1.1.13`, `About` |
| A7 | jumlah tool | Berapa tool yang dibawa Zephyr, dan cara melihat daftarnya? | `zephyr_self`, `68` (dihitung dari indeks kategori `tool`; dulu 67 — indeks sudah di-regen 2026-10-14) |
| A8 | jumlah setelan + pintasan | Berapa kunci setelan dan pintasan bawaan? | `124`, `34` |
| A9 | tabel | Tabel port: MCP, CDP WebView2, dev UI | `9222`, `9223`, `5173` |
| A10 | daftar + cara buka Settings | Langkah mengganti bahasa jawaban AI, mulai dari Settings | `Ctrl+,`, `answerLang` |
| A11 | tabel | Tabel tab panel bawah beserta status tampil bawaannya | `terminal`, `problems`, `output`, `debug`, `ports`, `ai`, `subagents` |
| A12 | negatif (anti-karangan) | Apakah ada kunci `mcp.host`, dan berapa nilai bawaannya? | **tidak boleh mengarang** nilai `mcp.host` |

Jumlah pada A7/A8 **dihitung dari indeks**, bukan ditulis tangan: menambah satu
tool tidak boleh langsung membuat acuannya basi.

Keluaran nyata sekarang:

```
  RINGKAS: 12 acuan | 12 ter-grounding | 0 cacat rubrik
  Butir mana pun yang butuh jawaban model tetap TIDAK DIUJI sampai ada berkas bukti.
```

## Butir rubrik

| Butir | Lolos kalau | TIDAK DIUJI kalau |
| --- | --- | --- |
| R1 bahasa | penanda kata Indonesia ≥ penanda Inggris untuk jawaban ≥ 20 kata | jawaban < 20 kata |
| R2 tabel markdown | ada baris berisi `|` **dan** baris pemisah `--- \| ---` | pertanyaan tidak minta tabel |
| R3 daftar | ≥ 3 butir daftar (`- `, `* `, `1. `) | pertanyaan tidak minta daftar |
| R4 sitasi jalur | setiap jalur yang disebut (`src/`, `scripts/`, `docs/`, `src-tauri/`) benar-benar ada di disk | jawaban tidak menyebut jalur apa pun |
| R5 rahasia | tidak ada pola kunci/token (`sk-…`, `ghp_…`, `AKIA…`, `BEGIN … PRIVATE KEY`, `api_key=<nilai>`) | — |
| R6 bentuk | jumlah judul ≤ 4 (short/normal) atau ≤ 8 (detail) | metadata `gaya` tidak diisi |
| **R7 angka indeks** | untuk acuan `A1`–`A12`: **semua** nilai `harap` muncul di jawaban | metadata `acuan` tidak diisi/asing |
| **R8 klaim nilai** | tidak ada angka/versi lepas dari fakta (`periksaKlaimNilai` di `src/lib/pembungkusBahasa.ts`) | — (selalu bisa dinilai kalau ada jawaban) |
| R9 ukuran | informasi: jumlah kata/char + sumber | — |

R7 dan R8 adalah dasar **rubrik yang tidak bisa dibodohi angka**: A12 menguji
kebalikannya (jawaban **wajib** menolak mengarang), F5 menguji R7+R8 benar-benar
menyalak.

Nilai rahasia yang tertangkap **tidak pernah dicetak** — hanya jumlah polanya.

## Semantik verdict

| Verdict | Arti | Kode keluar |
| --- | --- | --- |
| `LULUS` | ada berkas jawaban, semua butir lolos | 0 |
| `MERAH` | ada butir yang gagal pada jawaban nyata | 1 |
| `SEBAGIAN TIDAK DIUJI` | 1 berkas ada, butir merah nol, tapi ada butir tanpa bukti | 2 |
| `TIDAK DIUJI` | tidak ada berkas jawaban sama sekali | 2 |

## Mode skrip

| Mode | Gunanya | Hasil nyata sesi ini |
| --- | --- | --- |
| (tanpa argumen) | menilai `docs/uji-jawaban/*.md` | `TIDAK DIUJI` — 0 berkas, exit 2 |
| `--acuan` | mencetak 12 acuan + grounding-nya | `12/12 ter-grounding, 0 cacat rubrik` |
| `--uji-alat` | membuktikan rubrik bukan cap kosong (6 fixture) | `ALAT: 6/6 fixture tertangkap sesuai harapan` |
| `--uji-klaim-nilai` | uji murni `src/lib/pembungkusBahasa.ts` | `MODUL MURNI: 13/13 lulus` |
| `--uji-tabel-perender` | render nyata tabel lewat perender jawaban | `PERENDER: 8/8 lulus` |
| `--berkas <jalur>` | menilai satu berkas jawaban tertentu | — |

### Fixture `--uji-alat` (karangan uji alat, bukan jawaban Zeph)

- FIXTURE 1 pertanyaan Indonesia dijawab Inggris → `R1 MERAH` (Inggris 19 vs Indonesia 0).
- FIXTURE 2 diminta tabel/daftar, dijawab prosa → `R2 MERAH` + `R3 MERAH`.
- FIXTURE 3 ID + tabel + jalur nyata → merah nol.
- FIXTURE 4 jalur karangan + kunci bocor → `R4 MERAH` (1 jalur tidak ada) + `R5 MERAH` (2 pola, nilainya tidak dicetak).
- FIXTURE 5 **angka karangan** (port 9444/9555, versi 9.9.9) pada acuan A1 →
  `R7 MERAH` (0/2 nilai benar, hilang `9222`,`9223`) + `R8 MERAH` (3 nilai asing).
- FIXTURE 6 angka indeks benar + tabel pada acuan A9 → `R7` 3/3, semua LULUS.

## Item 149 — tabel markdown: di mana cacatnya (bukti)

Dua sisi diperiksa, satu yang rusak.

**Perender: dulu kurang, sekarang diperbaiki.** Sebelum sesi ini
`src/components/ai/ChatMessage.tsx` **tidak menimpa** komponen `table` sama sekali,
jadi tabel dirender react-markdown apa adanya — tanpa cara menggeser ke samping di
panel yang sempit. Tambalan (berkas ini **milik lane ini**):

- `src/components/ai/ChatMessage.tsx:227–236` — `MdTabel`: membungkus `<table>` dengan
  `div.ai-tabel-bungkus` + `data-testid="ai-tabel-bungkus"` + `overflowX: 'auto'`.
- `src/components/ai/ChatMessage.tsx:238` — `MD_NARASI` memakai `table: MdTabel`.
- `src/components/ai/ChatMessage.tsx:254` — `MD_JAWABAN` memakai `table: MdTabel`.

Bukti render nyata (`node scripts/ukur-mutu-jawaban.mjs --uji-tabel-perender`):
kode override **diambil apa adanya dari berkas itu**, diubah TSX→JS dengan esbuild
repo, lalu dipakai merender lewat `react-markdown` + `remark-gfm` +
`react-dom/server`. Tidak ada app, browser, jaringan, atau mock HTML:

```
  sumber override: src/components/ai/ChatMessage.tsx (6 baris)
  baris awal blok: 227
    LULUS  override tabel ada di perender             MdTabel
    LULUS  MD_NARASI memakai override tabel           table: MdTabel
    LULUS  MD_JAWABAN memakai override tabel           table: MdTabel
    LULUS  perender jawaban punya plugin GFM          MD_PLUGINS = [remarkGfm]
    LULUS  tabel didahului baris kosong: jadi <table> nyata ada <table><td>
    LULUS  tabel didahului baris kosong: dibungkus pembungkus geser
    LULUS  tabel menempel teks (tanpa baris kosong): jadi <table> nyata
    LULUS  tabel menempel teks (tanpa baris kosong): dibungkus pembungkus geser
  PERENDER: 8/8 lulus
  VERDICT: LULUS - tabel markdown jadi tabel nyata dan bisa digeser
```

Keluaran render (dipotong): `<p>Berikut tabelnya:</p><div class="ai-tabel-bungkus"
data-testid="ai-tabel-bungkus" style="overflow-x:auto"><table><thead><tr><th>nama</th>…`

**Prompt: di sini cacat sebenarnya — dan TIDAK DIKERJAKAN, hanya diusulkan.**
`src/lib/systemPrompt.ts` milik lane lain. Temuan deterministik (dibaca apa adanya):

1. Aturan bentuk tabel itu **kondisional** dan digerbangi kata kunci:
   `systemPrompt.ts:891–896` — kelas `tabel`, `cocok:` di `:892` =
   `tabel|table|kolom|bandingkan|perbandingan|compare|matriks|matrix|ceklis|checklist`.
   Permintaan seperti "sebutkan langkah-langkah …" (acuan A10) **tidak** menyalakan
   gerbang ini, jadi aturan bentuknya tidak pernah dikirim.
2. Urutannya memang kalah: blok kondisional masuk lewat `blokKondisional(kueri)` di
   `systemPrompt.ts:1087`, sedangkan blok gaya dikirim **sesudahnya** —
   `const gaya = instruksiGaya(answerStyle)` (`:1145`) lalu `bagian.push(gaya)` (`:1146`).
   Instruksi yang dibaca terakhir lebih kuat, dan untuk `short` isinya (`:626`):
   `'Answer in at most 3 sentences, or a short list.'` Jadi "maksimal 3 kalimat"
   datang **setelah** aturan tabel.

**Usulan tambalan (TULIS USAHA, jangan dikerjakan di lane ini):** di
`systemPrompt.ts`, setelah `bagian.push(gaya)` (`:1146`) dan setelah blok persona,
tambahkan:

```ts
import { blokKlaimNilai, blokPenutup } from './pembungkusBahasa';
// …
const klaim = blokKlaimNilai(answerLang);
if (klaim) bagian.push(klaim);
const penutup = blokPenutup(answerLang);
if (penutup) bagian.push(penutup);   // PALING AKHIR: bentuk diminta menang atas panjang
```

dan lebarkan gerbang kelas `tabel` (`:892`) supaya permintaan daftar/langkah ikut
membawa aturan bentuk: tambahkan `daftar|list|langkah|steps|urutan|satu per satu`.

## Item 161 — aturan klaim nilai

Modul murni `src/lib/pembungkusBahasa.ts` (140 baris, tanpa import, tanpa React,
tanpa store):

- `ATURAN_NILAI_ID` / `ATURAN_NILAI_EN` — 6 aturan: nilai wajib ada di fakta atau
  `zephyr_self`; jangan membulatkan; sebut sumber nilainya; jangan mengarang nama
  berkas/kunci/tombol/pintasan; bentuk yang diminta menang atas batas panjang;
  tabel hanya berisi nilai nyata.
- `blokKlaimNilai(bahasa)` — blok siap tempel ke prompt (judul + 6 butir).
- `blokPenutup(bahasa)` — penutup yang **harus** ditaruh paling akhir.
- `periksaKlaimNilai(jawaban, fakta)` — pemindai deterministik `port-asing`
  (angka 3–5 digit di konteks port/kuota yang tidak ada di fakta) dan `versi-asing`
  (`x.y.z` asing). Rujukan baris seperti `aiStore.ts:2034` **bukan** pelanggaran.

Bukti murni (`--uji-klaim-nilai`), tanpa app/model/jaringan: **13/13 lulus**,
termasuk "port karangan tertangkap", "port nyata diterima", "versi karangan
tertangkap", "rujukan baris bukan pelanggaran", "deterministik".

**Status jujur: modul ini BELUM TERPASANG.** Tidak ada berkas yang mengimpornya.
Sampai usulan tambalan `systemPrompt.ts` di atas masuk, aturan ini belum menyentuh
jawaban nyata. Yang **sudah** terpakai darinya: `periksaKlaimNilai` sebagai butir
**R8** di skrip ukur ini.

## Keadaan sekarang (apa adanya)

```
UKUR MUTU JAWABAN ZEPH (156+161)
  sumber bukti: docs/uji-jawaban/*.md  (ketemu 0 berkas)
  data ground: src/lib/zephyrFakta.ts + zephyrIndeks.ts termuat (versi 1.1.13)
  12 acuan    : 12/12 ter-grounding di data repo

  TIDAK DIUJI - tidak ada berkas jawaban. Tidak ada satu butir pun yang bisa
  dinilai, jadi skrip ini MENOLAK menyimpulkan LULUS maupun MERAH.
  ...
EXIT=2
```

Artinya: **mutu jawaban Zeph belum diukur sama sekali.** Bukan lulus, bukan
merah — belum ada bahannya. Alatnya sendiri sudah diuji (6/6 fixture, 13/13 modul
murni, 8/8 perender), dan magnet penghasil jawaban jalan sampai 18/18 (di bawah),
tapi lapis jawaban model nyata butuh kunci provider asli.

## Item 141+163 — pengetahuan dua lapis (`cek-pengetahuan-2lapis.mjs`)

Keluaran nyata (36 baris, disalin apa adanya):

```
LULUS  A1..A9  (prompt nyata 23411 char) - blok fakta ikut terkirim, port nyata
              (MCP 9222, CDP 9223, dev UI 5173), kunci setelan nyata, seksi Chat
              Settings, aturan anti-ngarang, aturan folder shell, bridge nyata
SKIP   B*     run nyata tak dijalankan: provider aktif=openai hasKey=true
              preview="MOCK…TEST" (placeholder/MOCK-KEY terdeteksi -> kunci palsu);
              nilai B/C akan mengukur kredensial, bukan pengetahuan
SKIP   C*     sama seperti B*
LULUS  L1a    body request diterima provider memuat prompt sistem (28321 char)
LULUS  L1b    provider MENERIMA 1 pesan role=tool (termasuk hasil zephyr_self)
LULUS  L1c    pintu zephyr_self hidup dan menjawab dari indeks bundel (9760 char)
LULUS  L1.1..L1.6  fakta nyata sampai ke provider: agents.maxPanes=6, port 9222,
              9223, kontrol sub-agent, Ctrl+J, settings.json di %APPDATA%
== 18/18 lulus ==
(2 pemeriksaan SKIP: tidak dinilai - lihat alasan di atas; bukan kegagalan)
ringkas: 18 dinilai (18 lulus), 2 skip
```

**Tidak ada MERAH di sini.** Dua SKIP bukan kegagalan dan **tidak** dikeluarkan
dari daftar: lapis B (jawaban model nyata) tidak bisa dinilai karena kunci provider
aktif adalah placeholder mock (`MOCK…TEST`) — menjalankannya justru akan mengukur
kredensial, bukan pengetahuan. Karena itu lapis B tetap **TIDAK DIUJI**.

Catatan status indeks: pemeriksaan "indeks sinkron" di `scripts/cek-batas-inti.mjs`
masih **DITUNDA** (indeks basi, sengaja tidak diregenerasi di sini) — dilaporkan apa
adanya, bukan diperbaiki.

## Sisa kebocoran bahasa (item 138)

- Lapis **deteksi** bahasa sudah hijau: `node scripts/uji-bahasa-jawaban.mjs` =
  46 lulus / 46 diperiksa (kata `cek, ya, kasih, contoh, buka, cara` sudah masuk
  `KATA_ID` di `src/lib/systemPrompt.ts`).
- Lapis **jawaban model nyata** tetap **TIDAK DIUJI** (butuh kunci provider asli).
- Pemindai label `node scripts/ukur-bocor-i18n.mjs` dijalankan: exit 0. Sisa yang
  masih berbahasa Inggris sebagian besar **nama seksi/setelan teknis** (Sub-agents,
  Tools, Permissions — nama asli seksi Chat Settings) dan berada di berkas **milik
  lane lain** (`src/components/**` di luar `ai/ChatMessage.tsx`, dan
  `src/components/settings/**`). Lane ini tidak menyuntingnya; kalau mau ditutup,
  itu pekerjaan lane pemilik berkas.

## Yang belum diukur dan mengapa

- **Bahasa jawaban pada provider nyata** (keluhan Ryu: tanya Indonesia dijawab
  Inggris). Yang bisa diuji tanpa jaringan hanya *aturan bahasa di dalam prompt*
  (`scripts/uji-bahasa-jawaban.mjs`, 46/46 — lapis deteksi sudah hijau) dan
  *bahasa jawaban tersimpan* (`R1` di sini). Yang tidak bisa: apakah model
  benar-benar patuh. Butuh jawaban nyata.
- **Tabel/daftar pada provider nyata** (`R2`/`R3`). Yang sudah dibuktikan:
  perender markdown app sanggup **dan** membungkus tabel
  (`scripts/ukur-mutu-jawaban.mjs --uji-tabel-perender`, 8/8) dan
  aturan prompt untuk tabel ada tapi kondisional (`docs/JAWABAN-TABEL-DAN-DAFTAR.md`,
  `systemPrompt.ts:891`).
- **Angka benar pada provider nyata** (`R7`/`R8`). Acuan dan pemindai nilainya sudah
  teruji murni; yang belum ada hanya jawabannya.
- **Panjang jawaban vs `answerStyle`.** Tidak ada butir untuk ini: tanpa jawaban
  nyata, panjang prompt ≠ panjang jawaban. Menambahkan butir "panjang wajar"
  tanpa bukti hanya akan jadi cap hijau palsu.
