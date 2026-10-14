# LAPORAN ANGGARAN PESAN — BUG-ANGGARAN-PESAN

Harness: `scripts/uji-anggaran-pesan.mjs` (Node murni, tanpa jaringan/app/CDP).
Kode produk yang diukur **dibundel esbuild dari `src/lib/*.ts` asli** (bukan salinan konstanta):
`systemPromptFor`, `PAYLOAD_MAX_CHARS`, `ukuranPayload`, `ringkasRiwayat`, `bentukWireRiwayat`,
`statusPekerjaan`, `agentToolSpecs`, `TOOL_DIKIRIM_SELALU`.

**Hasil: LULUS=11 GAGAL=9 TEMUAN=10 (20 kasus).** Exit code 1 (harness ini memang bisa merah).

> Catatan integritas: semua angka di bawah berasal dari keluaran harness yang ditempel apa adanya
> di §2. Tidak ada `src/**` / `src-tauri/**` yang diubah (READ-ONLY dipatuhi).

---

## 0. Cara reproduksi

```bash
cd D:/Zephyr
node scripts/uji-anggaran-pesan.mjs                       # 44 giliran (beban default)
node scripts/uji-anggaran-pesan.mjs --giliran=200
node scripts/uji-anggaran-pesan.mjs --json=hasil.json
```

Harness menulis bundel ke `scratch/uji-anggaran-pesan/` (di luar repo).

---

## 1. Angka kunci (dari kode yang dikirim)

| Besaran | Nilai | Sumber |
|---|---|---|
| `PAYLOAD_MAX_CHARS` | **40.000** | `src/lib/contextBudget.ts` |
| spec 26 tool (`agentToolSpecs`) | 14.699 char (ukur-pesan 14.701) | `src/lib/agentTools.ts` |
| `reserveTools` = spec + 2048 | **16.749** | `src/lib/aiStore.ts:5929` |
| `capUntukPesan` = 40.000 − 16.749 | **23.251** | `src/lib/aiStore.ts:5930` |
| `systemPromptFor('id', …)` | **23.793** char | `src/lib/systemPrompt.ts` |
| blok tetap = system + reserve | **40.542** char | — |
| **payload kabel puncak** (pesan + spec tool) | **41.512** char | diukur harness |
| payload kabel **minimum** (44 giliran) | 41.314 char | diukur harness |
| pesan-saja puncak (`ukuranPayload(pesan)`) | **26.813** char vs cap 23.251 | diukur harness |
| penambahan pasca-potong puncak (`deltaAppend`) | **2.023** char | `aiStore.ts:6009-6025` |
| digest determinisme | `56eb00ac3e2a2382` (sama lintas-proses) | — |

Perhatikan: **`systemPromptFor` (23.793) > `capUntukPesan` (23.251) sebesar 542 char.**
Anggaran untuk riwayat sudah negatif sebelum satu pesan riwayat pun ikut.

---

## 2. Keluaran nyata harness (apa adanya)

```
=== UJI ANGGARAN PESAN — payload giliran vs PAYLOAD_MAX_CHARS & pesan terakhir ===
kode asli dibundel dari src/lib/*.ts (esbuild); teks dibaca dari src/lib/contextBudget.ts + src/lib/aiStore.ts
PAYLOAD_MAX_CHARS=40.000; reserveTools=16.749 (spec 14.699 + 2048); capUntukPesan=23.251; systemPromptFor=23.793; blok tetap=40.542

LULUS  A1-blok-tetap — systemPromptFor()=23.793 char; spec 26 tool=14.699 char (ukur-pesan 14.701); reserveTools=spec+2048=16.749 char; capUntukPesan=PAYLOAD_MAX_CHARS-reserveTools=23.251 char; PAYLOAD_MAX_CHARS=40.000; blok tetap (system+reserve)=40.542 char
GAGAL  A2-cap-tercapai — capUntukPesan 23.251 char < blok tetap 23.793 char: TIDAK MUNGKIN dicapai (selisih 542 char); setiap giliran memaksa jalur potong-terakhir (contextBudget.ts:288-300) menyala
GAGAL  A3-payload-giliran — 44 giliran; payload kabel (ukuranPayload(pesan)+ukuranPayload(tools)) 41.314-41.512 char; puncak 41.512 char vs PAYLOAD_MAX_CHARS=40.000; giliran yang MELEWATI batas=44/44 (contoh giliran 1: pesan 26.615 + tool 14.699 = 41.314 char, lebih 1.314 char)
GAGAL  A4-pesan-lewat-cap — ukuranPayload(pesan) puncak=26.813 char vs capUntukPesan=23.251 char; lewat cap di 44/44 giliran (kelebihan puncak 3.562 char); reserve margin 2048 char vs kelebihan 3.562 char -> margin HABIS
GAGAL  A5-append-pasca-potong — catatan status ditempel SETELAH ringkasRiwayat() (aiStore.ts:6009-6025) sehingga tak pernah dipotong: penambahan puncak=2.023 char (gerbang rencana 6034-6040 & koreksi argumen 6043-6047 menambah lagi pada jalurnya, juga di luar anggaran)
LULUS  B1-ekor-identitas — giliran yang pesan TERAKHIRNYA (sebelum catatan status) berbeda dari aslinya: 44/44; di antaranya TANPA catatan pemotongan=0; contoh giliran 1: tool asli 6.030 char → tool terkirim 505 char
LULUS  B2-ekor-catatan-terlihat — catatan pemotongan eksplisit yang terlihat model pada pesan terakhir: 44/44; contoh teks catatan memuat 'batas gateway'=true; jalur potong-terakhir contextBudget.ts:297
LULUS  B3-ekor-dipotong-bercatatan — pesan terakhir asli 25.014 char → terkirim 19.969 char (dipotong, BUKAN sama); catatan 'batas gateway' yang terlihat model=true (contextBudget.ts:288-300)
LULUS  C1-penjaga-statis — contextBudget.ts:183 batas loop 'for (let i = 0; i < clone.length - 1; i++)' -> i_maks = clone.length - 2; penjaga baris 189 mensyaratkan i = clone.length - 1 -> MUSTAHIL (clone.length - 2 != clone.length - 1); penjaga TIDAK DAPAT dieksekusi
LULUS  C2-penjaga-kontrol-negatif — kode ASLI (batas i < clone.length - 1) atas masukan yang ekornya pesan tool panjang: penjaga menyala 0 kali (harus 0 = MATI); payload 84.081->3.868 char
LULUS  C3-penjaga-kontrol-positif — batas loop DILANGGAR (i < clone.length): penjaga menyala 1 kali (harus >=1) — jadi penjaga BERFUNGSI kalau TERJANGKAU, dan MATI pada kode asli; catatan: walau penjaga menyala, trim-terakhir (contextBudget.ts:288-300) tetap memendekkan pesan terakhir (9.010→1.716 char, utuh=false) -> menambal penjaga SAJA tidak cukup
GAGAL  D1-situs-entri-langkah — entri langkah (ID) - set() agentSteps (aiStore.ts:6241): menyebut NAMA tool (res.error)=true, memuat POTONGAN argumen salah=false -> TIDAK LENGKAP (harus nama + potongan)
GAGAL  D2-situs-pesan-lanjutan — pesan lanjutan (ID) - history.push user (aiStore.ts:6249): menyebut NAMA tool (res.error)=false, memuat POTONGAN argumen salah=false -> TIDAK LENGKAP (harus nama + potongan)
GAGAL  D3-situs-koreksi-EN — koreksiArgumenTool (EN) - aiStore.ts:6046 (aiStore.ts:6045): menyebut NAMA tool (res.error)=false, memuat POTONGAN argumen salah=false -> TIDAK LENGKAP (harus nama + potongan)
LULUS  D4-cakupan-situs — 3 situs diuji TERPISAH (ditemukan 3/3); situs yang memuat nama+potongan=0/3; butuh nama+potongan: D1-situs-entri-langkah, D2-situs-pesan-lanjutan, D3-situs-koreksi-EN
GAGAL  D5-sumber-potongan-rust — openai.rs:604 parse_argumen_tool → galat malformed (openai.rs:633-635) 'tool call "{name}" returned malformed JSON arguments': menyebut NAMA tool=true, argumen ke-2 (potongan raw) dicetak=false -> res.error yang sampai ke aiStore TIDAK PERNAH memuat potongan argumen yang salah
GAGAL  D6-nama-tool — situs yang menyebut NAMA tool ke model=1/3 (lewat res.error): D2 (aiStore.ts:6249) & D3 (aiStore.ts:6046) TIDAK menyebut nama tool sama sekali -> model harus menebak panggilan mana yang rusak
LULUS  E1-laju-ladder — jalur galat provider (ladder 1000+2500 ms + tunggu-pulih 4000+12000+22000 ms): 6 percobaan/giliran, jeda 41.503,5 ms/giliran; puncak percobaan dalam jendela 60 dtk=11 (batas 70) -> AMAN
LULUS  E2-laju-malformed — jalur argumen-cacat: 2 percobaan/giliran (retryLimit=1 untuk malformed, 2 untuk terpotong), jeda antar-percobaan dari kode=0 ms (jalur retryableToolResponse TIDAK memakai tungguRetryAgent, terbaca=true); laju = 60.000/RTT: pada RTT=1000 ms -> 60 percobaan/60 dtk; agar <=70 perlu RTT >= 858 ms
LULUS  F1-determinisme — digest jalan 1 = jalan 2 = 56eb00ac3e2a2382… (atas prompt ternormalkan 23.774 char); tanpa jaringan, tanpa app, tanpa CDP

TEMUAN A1-cap-tak-tercapai — systemPromptFor() (23.793 char) SUDAH melebihi capUntukPesan (23.251 char) sebelum satu pesan riwayat ikut; ringkasUkuran() tidak pernah menyentuh pesan system, jadi cap ini TIDAK MUNGKIN dicapai dengan memangkas riwayat - yang dikorbankan selalu riwayat.
TEMUAN A3-kabel-lewat-batas — payload yang BENAR-BENAR dikirim (pesan + spec tool) melewati PAYLOAD_MAX_CHARS di 44/44 giliran; puncak 41.512 char (lebih 1.512 char). Akar: ukuranPayload() hanya mengukur PESAN, sementara capUntukPesan=PAYLOAD_MAX_CHARS-reserveTools (23.251) mengasumsikan reserve menutup spec tool - padahal blok tetap 23.793 char sudah > cap 23.251 char, jadi pesan tak pernah turun ke cap dan reserve 2048 char tak cukup menutup selisihnya.
TEMUAN A5-append-luar-anggaran — tiga kalimat (status pekerjaan, gerbang rencana, koreksi argumen) ditempel ke pesan SETELAH ringkasRiwayat() dipanggil, jadi ukurannya tak pernah masuk perhitungan cap - penambahan terukur sampai 2.023 char pada beban 44 giliran.
TEMUAN B1-ekor-dipotong — 44/44 giliran mengirim pesan TERAKHIR yang bukan pesan terakhir asli (contoh: tool 6.030→505 char). Catatan pemotongan resmi produk ADA di 44/44 contoh -> model diberi tahu, jadi ini bukan pemotongan DIAM-DIAM; tetapi identitas/isi pesan terakhir berubah karena blok tetap (23.793 char) > cap (23.251 char).
TEMUAN C2-penjaga-mati — penjaga baris 189 TIDAK PERNAH dieksekusi pada kode asli: ia hanya tampak melindungi giliran terakhir, padahal batas loop sudah mengecualikannya.
TEMUAN D4-argumen-cacat — hanya 0/3 situs pemulihan memuat NAMA tool + POTONGAN argumen salah. Tanpa nama tool: D2-situs-pesan-lanjutan, D3-situs-koreksi-EN; tanpa potongan argumen: D1-situs-entri-langkah, D2-situs-pesan-lanjutan, D3-situs-koreksi-EN. CATATAN KOREKSI HARNESS: scripts/uji-malformed-args.mjs:381 (M17) memakai jendela lebar SRC_STORE.slice(i-200, i+900) yang untuk situs D2/D3 menjangkau baris THROW res.error di bawahnya (aiStore.ts:6256) dan situs lain -> melaporkan 'menyertakan res.error' pada 3/3 situs. Jendela sempit per-situs di sini menunjukkan res.error hanya di situs entri-langkah (1/3). Ini cacat HARNESS, bukan bukti produk.
TEMUAN D5-rust-buang-potongan — raw_args dibaca di openai.rs:238 dan dipakai di :247 (parse_argumen_tool), tetapi galat malformed (openai.rs:633-635) TIDAK menginterpolasi raw -> potongan argumen yang salah HILANG di Rust, jadi TIDAK ADA dari tiga situs JS yang bisa menampilkannya. Ini akar teknis dari "galat tidak menyebut potongan argumen salah".
TEMUAN D6-nama-hilang — 2/3 situs koreksi TIDAK menyebut nama tool: jalur pesan-lanjutan (aiStore.ts:6249) dan jalur EN koreksiArgumenTool (aiStore.ts:6046). Agar model tahu panggilan mana yang gagal, keduanya perlu `res.error`.
TEMUAN E2-tanpa-jeda — jalur argumen-cacat mengulang SEKETIKA (jeda 0 ms, terbaca dari sumber=true); tidak ada pacer di app. Selama RTT provider >= 858 ms laju tetap <= 70/60 dtk (angka batas laju TIDAK ada di kode - hanya dari fakta provider). Ini 'perlu keputusan': tambahkan jeda kecil/pacer atau biarkan mengandalkan RTT provider.
TEMUAN E-rumus — retryLimit dibaca dari sumber='retryableToolResponse ? (truncated ? 2 : 1) : AGENT_PROVIDER_RETRY_DELAYS.length'; AGENT_PROVIDER_RETRY_DELAYS=[1000, 2500]; TUNGGU_PULIH_DELAYS=[4000, 12000, 22000]

RINGKASAN: LULUS=11 GAGAL=9 TEMUAN=10 (4651 ms)
PUNCAK KABEL : payload pesan+tools puncak=41.512 char vs PAYLOAD_MAX_CHARS=40.000 (lewat batas di 44/44 giliran); pesan-saja puncak=26.813 char vs cap=23.251
EKOR         : pesan terakhir berubah di 44/44 giliran; tanpa catatan pemotongan=0
DIGEST       : 56eb00ac3e2a2382 (sha256-16 atas {sistem-norm, cap, reserve, spec, giliran, situs})
```

Bukti determinisme lintas-proses (dua invokasi terpisah):

```
jalan1=DIGEST       : 56eb00ac3e2a2382
jalan2=DIGEST       : 56eb00ac3e2a2382
DIGEST-SAMA=LINTAS-PROSES
```

---

## 3. Vonis jujur per butir yang diminta

### (a) payload akhir SETIAP giliran ≤ `PAYLOAD_MAX_CHARS` — **TERBUKTI SALAH**
- Batas: **40.000** char. Puncak terukur: **41.512** char. Lewat batas di **44/44** giliran.
- Bahkan payload MINIMUM pada beban ini 41.314 char.
- Akar: `ukuranPayload()` mengukur **pesan saja**; pengiriman nyata = pesan **+ `tools: toolSpecs`** (14.699 char).
  `capUntukPesan = PAYLOAD_MAX_CHARS − reserveTools` mengandaikan reserve menutup spec tool — benar secara aljabar
  (`cap + spec = 40.000 − 2048`), **tetapi cap itu tak pernah tercapai** karena `systemPromptFor` (23.793) sudah
  melebihi cap (23.251). Jadi reserve 2048 tidak pernah "tersisa"; ia sudah terpakai lebih dulu.

### (b) pesan TERAKHIR yang dikirim == pesan terakhir asli — **TERBUKTI TIDAK SAMA, tetapi TIDAK DIAM-DIAM**
- 44/44 giliran pesan terakhir **berubah**. Contoh: pesan `tool` asli **6.030** char → terkirim **505** char.
- Catatan pemotongan eksplisit yang terlihat model: **44/44** (teks di `src/lib/contextBudget.ts:297`,
  memuat "batas gateway"). Jadi klausa "ATAU ada catatan pemotongan eksplisit" **terpenuhi** → butir (b) LULUS.
- Yang perlu keputusan pemilik: apakah pemotongan (walaupun diberi tahu) pada giliran yang sedang dikerjakan
  bisa diterima, karena akarnya (blok tetap > cap) membuat ini terjadi **tiap giliran**, bukan kadang-kadang.

### (c) penjaga `contextBudget.ts` (~183/189) benar-benar DIEKSEKUSI — **TERBUKTI MATI**
- `C1` statis: batas loop baris 183 `i < clone.length - 1` ⇒ `i` maksimum `clone.length - 2`;
  penjaga baris 189 mensyaratkan `i === clone.length - 1` ⇒ **mustahil**.
- `C2` kontrol negatif (kode asli): penjaga menyala **0** kali.
- `C3` kontrol positif (batas loop sengaja dilanggar menjadi `i < clone.length`): penjaga menyala **1** kali
  ⇒ penjaga **berfungsi bila terjangkau**, dan mati pada kode asli. Catatan penting: walau penjaga menyala,
  trim-terakhir (`contextBudget.ts:288-300`) **tetap** memendekkan pesan terakhir (9.010→1.716 char, utuh=false)
  ⇒ **menambal penjaga saja tidak menyelesaikan (b)**.

### (d) KETIGA situs pemulihan argumen-cacat memuat NAMA tool + POTONGAN argumen salah — **TERBUKTI GAGAL 0/3**
Diuji per-situs (jendela sempit, tak melintasi blok):

| Situs | Lokasi | NAMA tool | POTONGAN argumen |
|---|---|---|---|
| D1 entri-langkah | `aiStore.ts:6241` | ✅ (`${res.error}`) | ❌ |
| D2 pesan-lanjutan | `aiStore.ts:6249` | ❌ | ❌ |
| D3 koreksi EN | `aiStore.ts:6046` | ❌ | ❌ |

- **Akar D2/D3:** teksnya statis, tidak menginterpolasi `res.error`.
- **Akar potongan args (semua situs):** `src-tauri/src/adapters/openai.rs` membaca `raw_args` (baris 238) dan
  memakainya (baris 247) untuk `parse_argumen_tool`, tetapi galat malformed (baris **633-635**) berbunyi
  `tool call "{name}" returned malformed JSON arguments` — **tanpa potongan argumen**. Karena argumen mentah
  hanya ada di Rust dan dibuang di sana, **tidak ada** dari tiga situs JS yang *bisa* menampilkannya.
- **Koreksi atas lane lain:** `scripts/uji-malformed-args.mjs:381` (M17) memakai jendela lebar
  `SRC_STORE.slice(i - 200, i + 900)` yang menjangkau baris `throw new Error(res.error)` di bawahnya
  (`aiStore.ts:6256`), sehingga melaporkan "menyertakan res.error" pada 3/3 situs — **false positive cacat
  harness**, bukan bukti produk. Klaim "7/14 pesan tak memuat potongan argumen" **konsisten** dengan
  hasil di sini: 0/3 situs memuat potongan.

### (e) laju percobaan ulang ≤ 70 percobaan/60 dtk — **LULUS (aman)**
- Jalur galat provider: **11** percobaan puncak dalam jendela 60 dtk (batas 70).
- Jalur argumen-cacat: **60** percobaan/60 dtk pada RTT=1000 ms (2 percobaan/giliran, jeda 0 ms dari kode);
  agar ≤ 70 perlu RTT ≥ 858 ms. Karena jeda antar-percobaan **0 ms** (tidak ada pacer di app), angka ini
  bergantung pada RTT provider — lihat "perlu keputusan".

### (f) determinisme (2× jalan, digest sama) — **LULUS**
- Digest `56eb00ac3e2a2382` **identik** pada dua invokasi proses terpisah (bukan hanya dua hitungan dalam satu proses).

---

## 4. Klasifikasi temuan

### Cacat PRODUK (perlu patch — lihat `docs/USULAN-ANGGARAN-PESAN.md`)
1. **A2/A3/A4 — anggaran tak-tercapai & payload lewat batas.** `capUntukPesan` (23.251) < blok tetap (23.793);
   payload kabel 41.512 > 40.000 di 44/44 giliran. Patch #2.
2. **A5 — tiga kalimat ditempel SETELAH pemotongan**, di luar anggaran (sampai 2.023 char). Patch #3.
3. **C — penjaga `contextBudget.ts:188-189` mati** (kode mati + komentar menyesatkan). Patch #1.
4. **D — situs pemulihan tak menyebut nama tool / potongan argumen.** Patch #4 (JS), #5 (Rust).
5. **D5 — Rust membuang potongan argumen mentah** sebelum JS bisa memakainya. Patch #5.

### Cacat HARNESS (bukan produk)
6. **M17 `scripts/uji-malformed-args.mjs:381`** — jendela `slice(i-200, i+900)` melintasi blok → false positive
   "3/3 situs menyertakan res.error". Rekomendasi: per-situs sempit (seperti D1/D2/D3 di harness ini).

### Perlu KEPUTUSAN pemilik (bukan jelas-jelas salah)
7. **B1 — memotong giliran terakhir** yang sedang dikerjakan, walau diberi catatan. Merupakan konsekuensi tak
   terhindar dari blok tetap > cap; keputusan: naikkan batas, kecilkan system prompt, kurangi tool, atau terima.
8. **E2 — laju argumen-cacat tanpa jeda** (0 ms). Aman selama RTT ≥ 858 ms; keputusan: tambah pacer atau andalkan RTT.
9. **Sumber angka 70/60 dtk** tidak ada di kode (hanya fakta provider) — harness memakainya sebagai batas asumsi.

---

## 5. Keterbatasan (apa yang harness ini TIDAK buktikan)

- Harness mengukur **ukuran payload yang dirakit** (`ukuranPayload`, `bentukWireRiwayat`, `ringkasRiwayat` asli),
  **bukan** provider nyata; ia tidak mengirim HTTP dan tidak memvalidasi batas gateway di sisi server.
- Angka laju (e) adalah **perhitungan dari jeda di kode** + asumsi RTT; batas 70/60 dtk bukan konstanta repo.
- Panjang `systemPromptFor` **bergeser antar-jalan** (mis. 23.793 vs 23.798) karena `src/lib/systemPrompt.ts:94`
  menyematkan `new Date().toISOString()` **dan** potret state app yang hidup; harness menormalkan cap waktu ISO
  sebelum men-digest agar perbandingan lintas-proses sah.
- Situs D dan penjaga C diverifikasi lewat **pembacaan teks sumber** (statis) **plus** pemanggilan fungsi asli;
  C2/C3 menyuntik perubahan batas-loop pada bundel salinan (bukan pada produk) sebagai kontrol positif.

