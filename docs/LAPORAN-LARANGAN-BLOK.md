# LAPORAN - blok "cara kerja + LARANGAN" padat (item ZEPH-LARANGAN-BLOK)

Tanggal: 14 Okt 2026 · Branch: `feat/ai-panel-vscode-layout` · Lingkup berkas produk: `src/lib/systemPrompt.ts` (satu-satunya yang disentuh)

## 0. Vonis ringkas

| # | Deliverable | Status | Bukti |
|---|---|---|---|
| 1 | Perubahan di `src/lib/systemPrompt.ts` (blok LARANGAN padat, 7 aturan wajib) | **DITERAPKAN** | `git diff` + dump teks terkirim (§1, §3) |
| 2 | `scripts/uji-larangan-live.mjs` (>=14 kasus, node murni, tanpa app/CDP/jaringan) | **DIBUAT + HIJAU (38/38)** | keluaran nyata §4 |
| 3 | Laporan ini | **ADA** | - |
| 4 | `docs/USULAN-LARANGAN-BLOK.md` | **ADA** | - |
| - | Anggaran blok inti tetap <= 2.000 token | **YA**: id 7.984 char / 1.996 tok, en 7.925 / 1.982 (ambang 8.000 char / 2.000 tok) | `uji-larangan-live.mjs` B1-B3 + `uji-blok-inti.mjs` + `uji-tahu-100p.mjs` |
| - | Judul blok tidak berubah (`# Batas keras` / `# Hard limits`) | **YA** | C.1-C.3 + `uji-blok-inti.mjs` C.4/C.8 |
| - | `cek-batas-inti.mjs` hijau | **TIDAK (DITUNDA)** - merah HANYA di cek "indeks sinkron dengan sumber" (INDEKS BASI, pre-existing) | §6 |

## 1. Apa yang berubah

Berkas: `src/lib/systemPrompt.ts`, konstanta `LARANGAN_EN` / `LARANGAN_ID` (+ komentar blok di atasnya). `blokLarangan()` tidak diubah.

### 1a. Teks LAMA (verbatim, 6 butir; 728 char id / 702 char en)

Dikutip apa adanya dari `docs/USULAN-BLOK-KONDISIONAL.md` bagian "Teks lama (verbatim)" - dokumen itu merekam kondisi blok sebelum perubahan ini. (Catatan kejujuran: salinan pra-patch tidak ada lagi di disk - berkas sudah ditimpa - dan tidak ada di git: `git show HEAD:src/lib/systemPrompt.ts` hanya 519 baris dan **tidak memuat** `LARANGAN_EN`/`LARANGAN_ID` sama sekali, jadi HEAD bukan rujukan yang bisa dipakai untuk rollback.)

```
const LARANGAN_EN = [
  '# Hard limits',
  '1. Never invent a value, file, setting, port or doc. Not in the facts above and not read this turn = say so, or look it up.',
  '2. Answer in the active language of the app. The English material above is SOURCE, not the language of your answer.',
  '3. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.',
  '4. Never print secrets (API key, token, SSH key, .env): say where the user can see them.',
  '5. Never run a destructive tool (delete, move, overwrite, force push, kill a process) unless the user asked for it.',
  '6. Never answer a Zephyr question from memory: the facts above + `zephyr_self`; nothing found = the feature does not exist.',
].join('\n');

const LARANGAN_ID = [
  '# Batas keras',
  '1. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas dan tidak dibaca giliran ini = bilang apa adanya, atau cari dulu.',
  '2. Jawab dalam bahasa aktif aplikasi: teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.',
  '3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.',
  '4. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env): sebut di mana user bisa melihatnya.',
  '5. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) tanpa diminta user.',
  '6. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`; tidak ketemu = fiturnya tidak ada.',
].join('\n');
```

### 1b. Teks BARU (verbatim dari teks TERKIRIM; 8 butir; 902 char id / 838 char en)

Angka di kiri = panjang baris (char), diukur dari dump prompt:

```
=== BLOK larangan (id) 902 char ===
[13] # Batas keras
[99] 1. Baca dulu sebelum menebak: buka berkas atau setelan yang relevan sebelum menjawab atau mengedit.
[127] 2. Jangan mengarang nilai, berkas, setelan, port, atau dokumen: tidak ada di fakta di atas = bilang apa adanya, atau cari dulu.
[129] 3. Jangan bilang sudah menjalankan atau memperbaiki sesuatu kalau belum: klaim bukan bukti. Jalankan, baca hasilnya, baru bilang.
[94] 4. Jawab dalam bahasa aktif aplikasi; teks Inggris di atas itu SUMBER, bukan bahasa jawabanmu.
[102] 5. Jangan tampilkan isi rahasia (API key, token, kunci SSH, .env): sebut di mana user bisa melihatnya.
[118] 6. Jangan panggil tool perusak (hapus, pindah, timpa, force push, matikan proses) atau commit/push tanpa diminta user.
[92] 7. Jangan menjawab pertanyaan soal Zephyr dari ingatan: pakai fakta di atas + `zephyr_self`.
[120] 8. Keluaran yang kamu kutip harus dari tool yang benar-benar jalan giliran ini; kalau gagal, kutip error-nya apa adanya.

=== BLOK larangan (en) 838 char ===
[13] # Hard limits
[88] 1. Read before you guess: open the relevant file or setting before answering or editing.
[100] 2. Never invent a value, file, setting, port or doc: not in the facts above = say so, or look it up.
[99] 3. Answer in the active language of the app; the English above is SOURCE, not your answer language.
[119] 4. Never claim you did, ran or fixed something you did not: a claim is not proof. Run it, read the result, then say it.
[88] 5. Never print secrets (API key, token, SSH key, .env): say where the user can see them.
[130] 6. Never run a destructive tool (delete, move, overwrite, force push, kill a process) or commit/push unless the user asked for it.
[79] 7. Never answer a Zephyr question from memory: the facts above + `zephyr_self`.
[114] 8. Any output you quote must come from a tool that actually ran this turn; if it failed, quote the error as it is.
```

### 1c. Edit yang dibayar (tambahan vs pemangkasan)

| Butir | Status | Keterangan |
|---|---|---|
| id/en 1 "baca dulu sebelum menebak" | **BARU** | menutup butir wajib (1); satu baris, menunjuk aksi (buka berkas/setelan) |
| 2 "jangan mengarang nilai..." | tetap | hanya ekor "dan tidak dibaca giliran ini" / "Not in the facts above and not read this turn" dipangkas (ada di blok `caraKerja`) |
| 3 "klaim bukan bukti..." | tetap | hanya ekor "selesai" / "then say it" dipangkas |
| 5 "tool perusak ... atau **commit/push** tanpa diminta user" | **DIPERLUAS** | +["atau commit/push"] menutup butir wajib (5); tool perusak tanpa commit/push tidak lagi cukup |
| 7 "dari ingatan..." | tetap | hanya ekor "; tidak ketemu = fiturnya tidak ada" / "; nothing found = the feature does not exist" dipangkas (sudah ada di `aturan`/`caraKerja`) |
| id/en 8 "kutip hanya keluaran tool..." | **BARU** | menutup butir wajib (3) dalam bentuk POSITIF supaya tidak ada frasa aturan yang muncul dua kali - larangan "Jangan mengarang output" / "Never invent output" sudah ada di blok `aturan`, dan mengulangnya kata-per-kata = aturan kembar (diuji D) |

Butir wajib (2) "tool gagal -> baca error + coba cara lain" **tidak** dimasukkan ke blok ini: teks yang sudah terkirim memuatnya verbatim di blok `caraKerja` ("Kalau tool gagal, baca error-nya dan coba cara lain", "jangan ulangi perintah yang sama") - duplikasi justru dilarang oleh syarat (d).

### 1d. Hubungan dengan usulan lama `docs/USULAN-BLOK-KONDISIONAL.md` (P1)

Usulan lama (P1) sudah berisi teks 8 poin "siap tempel" berukuran **815 char id / 784 char en** (inti jadi 7.897 char). Yang diterapkan di sini **bukan P1 verbatim**, dan alasannya jujur:

- P1 poinnya: 1=mengarang nilai, 2=bahasa, 3=klaim bukan bukti, 4=rahasia, 5=tool perusak, 6=ingatan, 7="satu langkah, satu tool", 8="pakai tool hanya kalau memberi info baru". P1 **tidak** memuat "baca dulu sebelum menebak" (butir wajib 1) dan **tidak** memuat "commit/push" eksplisit (butir wajib 5); poin 7-8 P1 adalah aturan efisiensi tool, bukan butir wajib yang diminta.
- Yang diterapkan: 8 butir yang menutup **ke-7 butir wajib** secara eksplisit (2 di antaranya sudah ada di `caraKerja`, jadi tidak diduplikasi), harga +174 char (id) / +136 char (en) - semuanya dibayar dari sisa anggaran tanpa menembus batas.
- Poin 7-8 P1 (efisiensi tool) **tidak** dimasukkan: bukan butir wajib, dan sisa anggaran id tinggal 16 char (lihat §2). Diusulkan di `docs/USULAN-LARANGAN-BLOK.md`.

## 2. Angka anggaran sebelum-sesudah (nyata, diukur)

Satuan gate: `token = Math.ceil(char / 4)`; `AMBANG_TOKEN_INTI = 2000` **dibaca dari kode** `src/lib/systemPrompt.ts` oleh harness B2 (bukan ditulis ulang di harness) = 8.000 char.

| Ukuran | SEBELUM | SESUDAH | Delta |
|---|---|---|---|
| blok larangan id | 728 char | **902 char** | +174 |
| blok inti id (faktaInti 6.986 + larangan + kepala 96) | 7.810 char / 1.953 tok | **7.984 char / 1.996 tok** | +174 char (+43 tok) |
| sisa ruang id sebelum ambang 8.000 | 190 char | **16 char** | -174 |
| blok larangan en | 702 char | **838 char** | +136 |
| blok inti en (faktaInti 6.986 + larangan + kepala 101) | 7.789 char / 1.948 tok | **7.925 char / 1.982 tok** | +136 char (+34 tok) |
| sisa ruang en sebelum ambang 8.000 | 211 char | **75 char** | -136 |
| prompt total terkirim (seluruh blok) | - | 21.901 char / 5.476 tok (id), 21.052 / 5.263 (en) | - |

Angka SEBELUM diambil dari konstanta `BF` di harness yang nilainya direkam dari keluaran `uji-blok-inti.mjs` sebelum patch (id 7.810/1.953, en 7.789/1.948) - bukan dikarang ulang. Konfirmasi silang independen: `uji-blok-inti.mjs` sesudah patch melaporkan **id 7.984 / 1.996 tok, en 7.925 / 1.982 tok**; `uji-tahu-100p.mjs` melaporkan **blok inti 1.997 tok <= 2.000** (selisih 1 tok dari angka harness sendiri karena komposisi kueri/potretnya beda satu baris); `uji-blok-kondisional.mjs` melaporkan **7.984 char / 1.996 tok**.

Catatan penting supaya tidak tertukar: `cek-batas-inti.mjs` melaporkan "ukuran blok inti **7950 char**" - angka itu **FAKTA_ZEPHYR generated** (`src/lib/zephyrFakta.ts`), bukan komposisi blok inti (fakta + larangan + kepala). Nilainya tidak berubah oleh patch ini dan tetap <= 8.000.

## 3. Aturan mana yang terbukti ada di teks terkirim

`scripts/uji-larangan-live.mjs` membundel `src/lib/**` asli dengan esbuild (modul yang butuh browser/tauri/xterm di-stub, pola sama dengan `scripts/uji-blok-inti.mjs`), lalu memanggil `systemPromptFor()` - jadi yang diperiksa adalah **teks yang benar-benar diserahkan ke lapisan model**, bukan konstanta. 14 pemeriksaan A = 7 aturan x 2 bahasa:

| Butir wajib | Tanda tangan yang dicari (id / en) | Ketemu di |
|---|---|---|
| (1) baca dulu sebelum menebak | `Baca dulu sebelum menebak` / `Read before you guess` (+ `jangan menebak` / `do not guess`) | **blok LARANGAN** butir 1 (baru) + `caraKerja` |
| (2) tool gagal -> baca error + coba cara lain | `Kalau tool gagal, baca error-nya dan coba cara lain` / `When a tool fails, read the error and try a different approach` (+ `jangan ulangi perintah yang sama` / `never repeat the same command`) | `caraKerja` (sudah ada; sengaja **tidak** diduplikasi ke blok - diuji F: 6/7 aturan ada di blok) |
| (3) JANGAN mengarang keluaran/hasil | `Jangan mengarang output` / `Never invent output` (blok `aturan`) + `Keluaran yang kamu kutip harus dari tool` / `Any output you quote must come from a tool that actually ran` (blok LARANGAN butir 8, baru) | `aturan` + **blok LARANGAN** butir 8 |
| (4) JANGAN menampilkan kredensial | `Jangan tampilkan isi rahasia` / `Never print secrets` + `API key, token, kunci SSH` / `API key, token, SSH key` | **blok LARANGAN** butir 5 (tetap) |
| (5) JANGAN commit/push tanpa diminta | `commit/push tanpa diminta user` / `commit/push unless the user asked for it` | **blok LARANGAN** butir 6 (diperluas ronde ini) |
| (6) "selesai" = sudah dijalankan + hasilnya dibaca | `klaim bukan bukti. Jalankan, baca hasilnya` / `a claim is not proof. Run it, read the result` (+ `baca hasilnya` / `read the result`) | **blok LARANGAN** butir 3 (tetap) + `caraKerja` |
| (7) ikuti bahasa user | `Jawab dalam bahasa aktif aplikasi` / `Answer in the active language of the app` (+ `balas dalam bahasa yang dipakai pengguna` / `reply in the language the user wrote in`) | **blok LARANGAN** butir 4 (tetap) + `aturan` |

Posisi blok di teks terkirim (diukur dari dump): awal blok `# Batas keras` ada di **offset 8.876** dari 21.901 char (id), dan `# Hard limits` di **offset 8.699** dari 21.052 char (en) - yaitu **ekor blok inti** (sesudah fakta), sebelum blok indeks/potret runtime/aturan proyek/konteks. Jadi "dekat jawaban" itu benar **relatif terhadap blok inti**, bukan baris paling akhir seluruh prompt (sesudahnya masih ada blok lain).

Isolasi bahasa diperiksa: prompt **en tidak memuat** judul id `# Batas keras` (`indexOf = -1`, `includes = false`) dan sebaliknya; blok larangan en baris pertama `# Hard limits`. Jadi judul tidak tertukar antar bahasa, dan penambahan hanya berdampak pada bahasa yang dipakai.

## 4. Keluaran nyata harness (38/38, exit 0)

```
$ node scripts/uji-larangan-live.mjs
UJI LARANGAN LIVE (ZEPH-LARANGAN-BLOK) - teks terkirim dari systemPromptFor()
  prompt terkirim: id 21901 char / 5476 tok, en 21052 char / 5263 tok
OK    A.R1-baca-dulu id - baca dulu sebelum menebak: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R2-tool-gagal id - tool gagal -> baca error + coba cara lain: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R3-jangan-mengarang-keluaran id - jangan mengarang keluaran/hasil: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R4-kredensial id - jangan menampilkan kredensial: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R5-commit-push id - jangan commit/push tanpa diminta: 1/1 tanda tangan teks ketemu di prompt terkirim
OK    A.R6-selesai-bukti id - 'selesai' = sudah dijalankan + hasilnya dibaca: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R7-bahasa-user id - ikuti bahasa user: 2/2 tanda tangan teks ketemu di prompt terkirim
OK    A.R1-baca-dulu en - ... (idem, 7 aturan bahasa Inggris) ...
OK    A.R7-bahasa-user en - ikuti bahasa user: 2/2 tanda tangan teks ketemu di prompt terkirim
  id: blok larangan SEBELUM 728 char -> SESUDAH 902 char (+174) | blok inti SEBELUM 7810 char / 1953 tok -> SESUDAH 7984 char / 1996 tok (sisa ruang 190 -> 16 char dari ambang 8000)
OK    B1 ambang id - blok inti (faktaInti 6986 + larangan 902 + kepala 96) = 7984 char / 1996 tok <= 8000 char / 2000 tok
OK    B2 anggaran baca dari kode id - AMBANG_TOKEN_INTI = 2000 token (dibaca dari src/lib/systemPrompt.ts, bukan ditulis di harness)
OK    B3 sisa ruang id - tambahan blok 174 char dibayar dari sisa 190 char -> sisa akhir 16 char
  en: blok larangan SEBELUM 702 char -> SESUDAH 838 char (+136) | blok inti SEBELUM 7789 char / 1948 tok -> SESUDAH 7925 char / 1982 tok (sisa ruang 211 -> 75 char dari ambang 8000)
OK    B1 ambang en - blok inti (faktaInti 6986 + larangan 838 + kepala 101) = 7925 char / 1982 tok <= 8000 char / 2000 tok
OK    B2 anggaran baca dari kode en - AMBANG_TOKEN_INTI = 2000 token (dibaca dari src/lib/systemPrompt.ts, bukan ditulis di harness)
OK    B3 sisa ruang en - tambahan blok 136 char dibayar dari sisa 211 char -> sisa akhir 75 char
  catatan SEBELUM: uji-blok-inti.mjs sebelum patch: id 7810 char / 1953 tok, en 7789 char / 1948 tok; blokLarangan 728 (id) / 702 (en) char
OK    C.1 judul id - baris pertama blok larangan = "# Batas keras" (harus "# Batas keras")
OK    C.1 judul en - baris pertama blok larangan = "# Hard limits" (harus "# Hard limits")
OK    C.2 - judul tidak tertukar antar bahasa (blok id tidak memuat judul en dan sebaliknya)
OK    C.3 - kedua judul benar-benar ada di teks yang dikirim (bukan cuma di konstanta)
OK    D.1 kembar dalam blok id - 8 butir bernomor, 8 unik, 0 baris berulang di dalam blok
OK    D.2 baris blok diulang di prompt id - tidak ada baris blok yang muncul kata-per-kata di tempat lain di prompt
OK    D.3 tanda tangan tiap aturan persis 1x id - tiap frasa muncul 1x di prompt (R1-baca-dulu=1+1, R2-tool-gagal=1+1, R3-jangan-mengarang-keluaran=1+1, R4-kredensial=1+1, R5-commit-push=1, R6-selesai-bukti=1+1, R7-bahasa-user=1+1)
OK    D.1 kembar dalam blok en - 8 butir bernomor, 8 unik, 0 baris berulang di dalam blok
OK    D.2 baris blok diulang di prompt en - tidak ada baris blok yang muncul kata-per-kata di tempat lain di prompt
OK    D.3 tanda tangan tiap aturan persis 1x en - tiap frasa muncul 1x di prompt (R1-baca-dulu=1+1, R2-tool-gagal=1+1, R3-jangan-mengarang-keluaran=1+1, R4-kredensial=1+1, R5-commit-push=1, R6-selesai-bukti=1+1, R7-bahasa-user=1+1)
OK    E.1 dua panggilan seproses id - jam dibekukan di entri; prompt 21901 char identik, blok larangan identik
OK    E.2 proses baru id - proses baru menghasilkan prompt 21901 char yang identik byte-per-byte
OK    E.1 dua panggilan seproses en - jam dibekukan di entri; prompt 21052 char identik, blok larangan identik
OK    E.2 proses baru en - proses baru menghasilkan prompt 21052 char yang identik byte-per-byte
OK    F.1 aturan di blok EKOR id - 6/7 aturan ketemu di blokLarangan() (R1-baca-dulu, R3-jangan-mengarang-keluaran, R4-kredensial, R5-commit-push, R6-selesai-bukti, R7-bahasa-user)
OK    F.2 blok ekor di teks terkirim id - seluruh blok larangan (902 char) benar-benar ada di prompt terkirim
OK    F.1 aturan di blok EKOR en - 6/7 aturan ketemu di blokLarangan() (R1-baca-dulu, R3-jangan-mengarang-keluaran, R4-kredensial, R5-commit-push, R6-selesai-bukti, R7-bahasa-user)
OK    F.2 blok ekor di teks terkirim en - seluruh blok larangan (838 char) benar-benar ada di prompt terkirim

Ringkas: id blok inti 7984 char / 1996 tok, en 7925 char / 1982 tok (ambang 2000 tok / 8000 char).
Blok larangan: id 902 char (sebelum 728), en 838 char (sebelum 702).
38/38 lulus
```

(Catatan teknis kejujuran determinisme: dua panggilan `systemPromptFor()` TANPA pembekuan jam berbeda persis di satu tempat - cap waktu potret runtime, teks "potret <ISO>". Karena itu harness membekukan `Date` di entrinya sebelum merakit prompt, supaya kasus E membandingkan teks aturan, bukan jam. Jam dibekukan hanya di dalam entri harness; kode produk tidak diubah untuk ini.)

## 5. Gate lain (dijalankan setelah perubahan)

| Perintah | Hasil |
|---|---|
| `node scripts/uji-blok-inti.mjs` | **37/37 lulus**; "blok inti id 7984 char / 1996 tok, en 7925 char / 1982 tok"; C.5 "8 larangan inti bernomor (minimal 5)" OK; C.4/C.8 (judul `Batas keras` / `# Hard limits`) OK |
| `node scripts/uji-blok-kondisional.mjs` | **69/69 lulus**; "blok inti 7984 char / 1996 tok (id), 7925 / 1982 (en); sisa ruang 16 char (id); blok padat usulan 815 char / 204 tok" |
| `node scripts/uji-pengetahuan-dua-lapis.mjs` | **27/27 lulus** (LULUS); blokLarangan dilaporkan 902/838 char; determinisme D2 id & en identik |
| `node scripts/uji-tahu-100p.mjs` | **59/59 lulus** (LULUS); "blok inti 1997 tok <= 2000"; 21 pertanyaan nyata dijawab dari inti |
| `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` | **0 galat** (`TSC_EXIT=0`, tanpa keluaran) |

## 6. Vonis jujur: terbukti / belum / butuh app / ditunda

**Terbukti (dengan keluaran nyata, tanpa app):**

- Ketujuh butir wajib benar-benar ada di teks yang diserahkan ke lapisan model, untuk bahasa **id dan en** (14 pemeriksaan A).
- Blok inti tetap di bawah anggaran: id 1.996 tok, en 1.982 tok dari 2.000 (B1-B3), dikonfirmasi tiga harness lain (blok-inti, kondisional, tahu-100p).
- Judul blok tidak berubah dan tetap baris pertama (C; plus gate lama C.4/C.8 tetap hijau).
- Tidak ada aturan kembar: 8 butir unik di dalam blok, tidak ada baris blok yang muncul lagi kata-per-kata di prompt, dan tiap tanda tangan aturan muncul **persis 1x** (D).
- Determinisme: 2 panggilan seproses identik, dan proses baru identik byte-per-byte (E).
- Blok (902/838 char) benar-benar tersambung di teks terkirim, bukan cuma konstanta (F.2), dan 6 dari 7 aturan memang tinggal di dalam blok ekor (F.1) - yang ke-7 (tool gagal) sengaja dibiarkan di `caraKerja` agar tidak kembar.
- `tsc --noEmit`: 0 galat.

**Belum terbukti / BUTUH APP (bukan wewenang lane ini):**

1. **Jalur app hidup.** Harness memanggil `systemPromptFor()` dari modul asli, tapi dengan stub untuk modul yang butuh runtime (persona kosong, indeks kosong, MCP kosong, gaya jawaban statis). App hidup memakai `uiLang` sungguhan dan mengisi blok-blok itu, sehingga prompt nyata lebih panjang (dokumen runtime menyebut ~22.988 char di app hidup vs 21.901 char versi harness) dan blok larangan **posisinya bergeser**. Yang bisa membuktikan ini tanpa menebak: `__ZEPHYR_PROMPT__.system('id','','')` di devBridge app hidup (lane CDP dilarang dari tugas ini). Usulan: jadikan harness kecil yang membaca string itu dan memeriksa 7 tanda tangan yang sama.
2. **Kepatuhan model** (apakah Zeph benar-benar berhenti mengarang/menampilkan kredensial) bukan urusan teks; butuh uji perilaku nyata di app.
3. **Bahasa selain id.** `blokLarangan()` hanya punya teks id/en; bahasa lain jatuh ke teks Inggris. Jadi hanya 2 bahasa yang "terbukti"; sisanya mewarisi EN.

**DITUNDA (bukan karena blok inti):**

- `node scripts/cek-batas-inti.mjs` **GAGAL** di satu cek: "indeks sinkron dengan sumber" (**INDEKS BASI**). Cek lain hijau, termasuk anggaran. Penyebabnya jelas dan **pre-existing**: `src/lib/zephyrIndeks.ts` mencatat entri `["kode","src/lib/systemPrompt.ts","1374 baris · ekspor: ..."]`, sedangkan berkas itu **sudah 1.411 baris sebelum perubahan ini** (drift 37 baris sudah ada pra-patch; sesudah patch berkas 1.429 baris, jadi drift bertambah). Perbaikan = regenerasi indeks (`scripts/gen-fakta-zephyr.mjs`) yang menulis `zephyrIndeks.ts`/`zephyrFakta.ts` - **berkas milik pemilik repo, dilarang disentuh lane ini**. `node scripts/verify-fakta-zephyr.mjs` melaporkan 1 masalah dengan akar yang sama (`gen-fakta-zephyr --check`). **Tidak diakali**: harness `uji-larangan-live.mjs` tidak butuh indeks, dan anggaran blok inti diukur langsung.
- `node scripts/uji-pengetahuan-angka.mjs` **crash** saat esbuild: `Unterminated string literal` di berkas entri yang di-generate harness itu sendiri (`scratch/uji-pengetahuan-angka/entri-self.ts:12`). Ini bug escaping di harness lane lain (bukan menyebut `systemPrompt`/larangan) dan tidak terkait perubahan ini; tidak saya perbaiki (bukan berkas saya).

## 7. Cara menjalankan ulang

```bash
cd D:/Zephyr
node scripts/uji-larangan-live.mjs          # 38/38, exit 0 (tanpa jaringan, tanpa app, tanpa CDP)
node scripts/uji-blok-inti.mjs             # 37/37
node scripts/uji-blok-kondisional.mjs      # 69/69
node scripts/uji-pengetahuan-dua-lapis.mjs # 27/27
node scripts/uji-tahu-100p.mjs             # 59/59
node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
```

## 8. Rollback (manual - git tidak bisa dipakai)

`HEAD` belum memuat blok ini sama sekali (`git show HEAD:src/lib/systemPrompt.ts` = 519 baris, tanpa `LARANGAN_*`), jadi `git checkout` tidak mengembalikan kondisi pra-patch. Kembalikan manual dengan mengganti isi `LARANGAN_ID`/`LARANGAN_EN` ke teks di §1a (6 butir). Tanpa itu, kembali ke HEAD **menghapus seluruh blok inti**, bukan hanya perubahan ini.
