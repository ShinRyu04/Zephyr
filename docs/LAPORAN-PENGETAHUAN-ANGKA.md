# LAPORAN PENGETAHUAN ANGKA — AI-TAHU-100-7

Item: **DESAIN PENGETAHUAN DUA LAPIS dengan ANGKA** (inti selalu nyala ≤ 2.000 token; sisanya dicari
on-demand maks 4 potongan × 800 token dengan cache per sesi; pencarian lokal deterministik tanpa folder user;
cap hash sumber + versi app, kalau basi keluaran WAJIB bilang BASI).

- Repo: `D:/Zephyr`, branch `feat/ai-panel-vscode-layout` (diverifikasi `git branch --show-current`).
- Tanggal ukur: 2026-10-14. Node: **v26.7.0** (diverifikasi `node --version`).
- Harness: `scripts/uji-pengetahuan-angka.mjs` (**43 kasus**, node murni, deterministik, TANPA jaringan/app/CDP).
- Cara jalan: `node scripts/uji-pengetahuan-angka.mjs` (exit 1 kalau ada merah — dan memang ada).
- Bukti mentah: `scratch/uji-pengetahuan-angka/{ringkas.json,hasil-A.json,hasil-B.json,hasil-B2.json,hasil-B-kosong.json}`;
  keluaran final tersimpan di `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/angka-verif-final.txt` (11.688 byte).

## 1. Ringkas

| | |
|---|---|
| Skor | **38/43 diperiksa** |
| Merah | **5**: D2, D3, F5, F6, G4 |
| Verdict harness | **GAGAL** (merah = cacat nyata, bukan bug harness) |
| Tuntutan tuntas | (a) inti ≤2.000 token, (b) 4×800 potongan, (c) cache sesi (jalur tool), (e) lokal/0 jaringan/tanpa folder user |
| Tuntutan belum | (d) pemangkasan ke `BATAS_KARAKTER_SUNTIK` **bocor** (12/60 kueri, maks 1576 > 1200) · (f) **indeks bundel BASI** dan kebasian itu **tidak pernah dibilang BASI di runtime** |
| Angka kunci | inti **7984 char / 1996 token** (ambang 2000) · potongan maks **768 token** · cache MISS 4 IPC → HIT 2 IPC · jaringan **0 panggilan** · cakupan **14/14 kategori, 6212 entri** |

## 2. Tabel tuntutan (a)–(g)

| # | Tuntutan | Angka nyata | Terbukti di | Status |
|---|---|---|---|---|
| a | inti SELALU nyala **≤ 2.000 token** | `AMBANG_TOKEN_INTI`=2000; inti+larangan+kepala = **7984 char = 1996 token** (sisa 4 token); fakta `6986`, larangan `902`, kepala `96` | `src/lib/systemPrompt.ts:737` (`AMBANG_TOKEN_INTI`), `:806` (`faktaInti`), `:867` (`blokLarangan`), `:93` (`kepalaPotret`); kasus A1–A5 | **LULUS** |
| b | on-demand **maks 4 potongan**, tiap potongan **≤ 800 token** | `POTONGAN_MAKS`=4, `TOKEN_POTONGAN_MAKS`=800, `KARAKTER_PER_TOKEN`=4; diminta 5 → **4**; diminta 0 → **1**; masukan 1 potongan 900 token → **796 token**; aktual 668+768+667+696 (maks 768) | `src/lib/zephyrTools/zephyrSelf.ts` (`POTONGAN_MAKS`/`TOKEN_POTONGAN_MAKS`/`potongKePotongan`); kasus B1–B9 | **LULUS** |
| c | **cache per sesi** benar-benar dipakai (hit/miss dihitung) | kueri sama 2×: MISS **4** panggilan IPC (`getAppInfo,getDiagnostics,getSettings,getAppInfo`) → HIT **2** (`getAppInfo,getDiagnostics`), keluaran **byte-identik**; kueri beda → ukuran cache 1→2 | `src/lib/zephyrTools/zephyrSelf.ts:63,65,69` (`CACHE_SESI`/`ukuranCacheSesi`/`bersihkanCacheSesi`), `:534-591`; kasus C1–C7 | **LULUS (jalur tool)**, **BELUM di jalur suntikan otomatis** — lihat §4.4 |
| d | pemangkasan ke **`BATAS_KARAKTER_SUNTIK`** terukur | `BATAS_KARAKTER_SUNTIK`=**1200**; blok lapis 2 = min **732** / rata **926** / maks **1576** char; bagian yang DIMETER maks **1183** (0/60 lewat); kalimat penutup **351 char di luar anggaran**; **12/60 kueri lewat batas, kelebihan maks 376 char**; `batasKarakter:300` → **654 char** | `src/lib/zephyrCari.ts:453` (konstanta), `:513-579` (`suntikanIndeks`), **akar di `:570-571`**; kasus D1–D5 | **BELUM (D2, D3 merah)** |
| e | pencarian **LOKAL deterministik, NOL jaringan, tanpa folder user** | panggilan jaringan runtime **0** (`[]`); referensi modul jaringan di bundel **0**; 2 jalan anak → sha256 identik `bd730b729c4a`; tanpa folder user (HOME/APPDATA absen + cwd kosong) → sha256 **tetap** `bd730b729c4a`; berkas di folder user **0** (tetap kosong) | spy `--require` (bungkus `fetch`/`WebSocket`/`XMLHttpRequest` + `http|https|net|dns|tls|http2`); kasus E1–E6 | **LULUS** |
| f | cap **hash sumber + versi app**; kalau basi → keluaran bilang **BASI** | versi app = indeks = `package.json` = `tauri.conf.json` = **1.1.13**; hash bundel **`f83cc022d0c620db`** vs hash sumber sekarang **`26e682bb085f4c80`**; `--check` **exit 1** "TIDAK SINKRON"; kontrol POSITIF (versi app 9.9.9) → `basi=true`, ada PERINGATAN, ada kata BASI; kontrol NEGATIF (versi sama) → **tidak ada** kata BASI | `src/lib/zephyrTools/zephyrSelf.ts:404,410-411,482,540,587-588`; `scripts/gen-fakta-zephyr.mjs --check`; kasus F1–F7 | **BELUM (F5, F6 merah)** — indeks BASI, dan kebasian hash tidak ditegakkan di runtime |
| g | cakupan **N/N** dari berkas indeks nyata | **14/14** kategori berisi; **6212** entri bundel (`bridge 1 · dokumen 176 · ekstensi 17 · kode 404 · label 3023 · layar 1976 · menu 122 · panel 22 · perintah 179 · pintasan 66 · port 4 · seksi 31 · setelan 124 · tool 67`); generator sekarang **6253** → selisih **41** (`kode +25`, `layar +16`) | `src/lib/zephyrIndeks.ts` (bundel), `scripts/gen-fakta-zephyr.mjs --print-cakupan` (read-only); kasus G1–G4 | **LULUS untuk N/N (14/14)**, **merah untuk kesinkronan (G4)** |

### 2.1 Tabel padanan dengan isi item

| Isi item | Angka | Status |
|---|---|---|
| inti SELALU nyala ≤ 2.000 token | 7984 char / **1996** token vs ambang **2000** | terbukti |
| sisanya dicari on-demand maks 4 potongan × 800 token | 4 × 800; aktual maks **768** token/potongan | terbukti |
| cache per sesi | MISS **4** IPC → HIT **2** IPC, cache 1 entri | terbukti di jalur `zephyr_self`; tidak ada di jalur suntik otomatis |
| pencarian lokal deterministik, NOL jaringan | **0** panggilan jaringan, sha256 sama 2× | terbukti |
| WAJIB jalan tanpa folder user | HOME/APPDATA absen → sha256 **sama**, 0 berkas dibuat | terbukti |
| cap hash sumber + versi app; basi → bilang BASI | hash **tidak cocok**, versi cocok → runtime **tidak** bilang BASI | **belum** (lihat §4.5) |
| cakupan N/N + hash & versi app | 14/14, 6212 entri; **BASI** (hash & jumlah entri) | cakupan terbukti; **status: BASI** |

## 3. Cara harness menegakkan angka (biar bisa diaudit)

- **Esbuild dua entry** dari `src/lib/**` ASLI: (A) `systemPrompt.ts` + `zephyrCari.ts` (stub plugin untuk impor non-inti),
  (B) `zephyrTools/zephyrSelf.ts` (stub `../commands`, `../store`, `../updaterStore`, `../mcpStore`, `../extensionStore`/`useExtensions`;
  `zephyrCari` + `zephyrIndeks` impor asli). `define: {'import.meta.env': …}` karena `zephyrSelf` memakainya di `versiRingkas()`.
  **Satu proses bundel per phase** → tiap phase diukur di proses terisolasi (tidak ada state bocor antar phase).
- **Spy jaringan** via preload CJS (`--require scratch/uji-pengetahuan-angka/spy.cjs`) → `globalThis.__JARINGAN`;
  membungkus `fetch`, `WebSocket`, `XMLHttpRequest`, dan `http|https|net|dns|tls|http2`
  (`request/get/connect/createConnection/lookup/resolve/Socket.prototype.connect`). Target bukti: **0** panggilan.
- **Nol jaringan/app/CDP**: harness tidak membuka port, tidak menyentuh `:9223`, tidak memanggil app.
  Yang di-spawn hanya `scripts/gen-fakta-zephyr.mjs` (`--check`, `--print-cakupan` — read-only) dan `esbuild`.
- **Determinisme**: jalan-1 / jalan-2 / jalan-tanpa-folder-user → sha256 keluaran `bd730b729c4a2e49` ketiganya.
- **`src/**` & `src-tauri/**` READ-ONLY**: harness hanya membaca, tidak menulis (`tsconfig.json` `include: ["src"]`
  → berkas `.ts` sementara di `scratch/` tidak masuk typecheck pemilik).

## 4. Temuan apa adanya

### 4.1 Blok inti LULUS, tapi hanya sisa 4 token
`inti + larangan + kepala = 7984 char = 1996 token` dari `AMBANG_TOKEN_INTI = 2000` (`systemPrompt.ts:737,806,867,93`).
Jadi "selalu nyala ≤2.000 token" **terbukti dengan angka**. Catatan: sisa hanya **4 token** — setiap tambahan
satu baris ke blok inti membuatnya langsung lewat ambang; komentar di `systemPrompt.ts:829` sudah menyebut
"setiap tambahan dibayar dengan memangkas EKOR", dan itu memang satu-satunya jalur.

### 4.2 `BATAS_KARAKTER_SUNTIK` BOCOR 376 char (D2)
`src/lib/zephyrCari.ts:487` menjanjikan **"Anggaran karakter untuk SELURUH blok (kepala + meta + entri + penutup)"**,
tetapi `:571` hanya menyisakan kepala+meta:
`let panjang = kepala.length + meta.length + 2; const jatah = batasKarakter - 4;` → **penutup (351 char, `:559-567`)
ditambahkan SESUDAH anggaran**, maka blok yang benar-benar beredar = 732–1576 char. `:574` memang menahan entri
agar bagian yang dimeter ≤ 1200 (**maks 1183, 0/60 lewat**), tapi totalnya lewat di **12/60 kueri** (kelebihan maks **376 char**).
Komentar `:451` ("kepala dan penutupnya tidak pernah terpotong") menjelaskan niatnya — jadi ini **kontradiksi
dokumen vs implementasi**, bukan sekadar salah hitung.

### 4.3 Opsi `batasKarakter` tidak dihormati sebagai batas TOTAL (D3)
`batasKarakter: 300` → blok jadi **654 char**: yang bisa dikurangi cuma entri, sementara kepala (76) + meta (~226) + penutup (351)
melewati 300 bahkan sebelum satu entri pun masuk. Artinya opsi itu hanya mengontrol bagian entri.

### 4.4 Cache per sesi: ADA di jalur tool, TIDAK di jalur suntikan otomatis (C6)
`zephyr_self` punya `CACHE_SESI` (`zephyrSelf.ts:63,65,69,534,591`): kueri sama 2× → MISS **4** IPC vs HIT **2** IPC,
keluaran byte-identik, cache 1→2 entri saat kueri beda. Dua panggilan yang tersisa saat HIT (`getAppInfo,getDiagnostics`)
adalah **pemeriksaan versi yang sengaja tidak di-cache** (`:540`). Sebaliknya `zephyrCari` **tidak mengekspor**
`ukuranCacheSesi`/`bersihkanCacheSesi` (keduanya `undefined`) → blok yang disuntikkan otomatis tiap giliran **dihitung ulang**
dari awal. Biayanya nol jaringan dan in-memory, jadi ini bukan bug performa — tapi tuntutan "cache per sesi"
belum berlaku di jalur itu. (Inferensi bahwa pencarian di-skip saat HIT dibaca dari posisi short-circuit `:534`
sebelum mesin pencari dipanggil — **dibaca dari kode, bukan diukur**; yang diukur adalah turunnya 4 → 2 IPC.)

### 4.5 Indeks bundel BASI — dan kebasiannya tidak pernah dibilang BASI (F5, F6, G4)
- **Kontrol positif nyata (bukan simulasi)**: `hashSumber` bundel `f83cc022d0c620db` ≠ hash dihitung ulang dari
  sumber saat ini `26e682bb085f4c80`; `node scripts/gen-fakta-zephyr.mjs --check` → **exit 1**: *"src/lib/zephyrIndeks.ts
  TIDAK SINKRON dengan sumbernya."*
- **Detektor kedua (jumlah entri)**: generator sekarang mencakup **6253** entri vs bundel **6212** → **+41**
  (`kode +25`, `layar +16`). Dua detektor independen sepakat → kebasiannya **nyata**, bukan artefak hash.
- **Yang lebih penting**: meski hash basi, keluaran runtime **tidak** memuat kata BASI. Di `zephyrSelf.ts:404`
  dan `:540` pembandingnya **versi app vs versi indeks** (`vApp !== f.aplikasi` / `vApp !== vIndeks`), bukan hash.
  Karena versi app == versi indeks (1.1.13), jalur itu menjawab **"Kemutakhiran indeks: segar (sama dengan versi app
  yang berjalan)"** — padahal hash dan jumlah entri membuktikan sebaliknya. Blok suntikan otomatis
  (`zephyrCari:521-523`) **memuat** hash (`source hash f83cc022d0c620db`) tetapi tidak pernah menyebut BASI:
  pembaca blok tidak punya cara tahu indeksnya basi.
- **Kontrol NEGATIF tetap hijau**: saat versi app dibuat beda (`9.9.9`), `basi=true`, ada `PERINGATAN`, ada kata `BASI`
  (`zephyrSelf.ts:587-588`) → mekanisme BASI ada dan bekerja, hanya **tidak tersambung ke hash**.

### 4.6 Kepala/header `zephyr_self` dihitung di luar cap potongan
Muatan 1 panggilan `maks:1` = **3315 char** (token ≈ **829**), sedangkan kepala/header JSON **242 char**
di luar potongan murni (**768 token** = 3071 char). Jadi 800 token dihormati untuk *tiap potongan*, tetapi
seluruh payload 1 panggilan berada **29 token di atas 800** kalau kepalanya ikut dihitung.

### 4.7 Catatan kejujuran proses
Dua cacat di harness sendiri sempat muncul dan sudah diperbaiki sebelum angka ini: (i) splitter potongan ikut
memasukkan baris header JSON ke potongan pertama (membuat token potongan-1 meleset), dan (ii) `versiApp` tidak
di-reset sebelum kontrol negatif sehingga "segar" ikut membaca 9.9.9. Setelah diperbaiki, kontrol negatif
benar-benar bersih (`ada kata BASI: false`) dan kontrol positif tetap menyala. Harness juga **exit 1** —
saya tidak menyetel semua lampu hijau supaya laporan ini enak dibaca.

## 5. Verifikasi tetangga & typecheck (bukti tambahan, bukan pengganti)

| Perintah | Hasil nyata |
|---|---|
| `node scripts/uji-pengetahuan-dua-lapis.mjs` | exit 0 — **SKOR 27/27**, "INDEKS: 6212 entri (semua kategori), app 1.1.13, hash f83cc022d0c620db", VERDICT LULUS |
| `node scripts/uji-tahu-100p.mjs` | exit 0 — **SKOR 59/59**, "blok inti **1997 tok <= 2000**" (silang-cek dengan 1996 token saya; beda pembulatan), VERDICT LULUS |
| `node scripts/uji-retrieval-otomatis.mjs` | exit 0 — **SKOR 29/29**, "suntikanIndeks otomatis 1x, suntikanDokumen 0x", VERDICT LULUS |
| `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` | **exit 0**, keluaran **0 byte** → 0 galat |
| `node scripts/cek-pengetahuan-2lapis.mjs` | **exit 2** — butuh `Cdp.attach(PORT)` (`scripts/lib-cdp.mjs:181-182 fetch http://127.0.0.1:<port>/json/list`) dan "Tidak ada pemeriksaan yang ditandai lulus di jalur ini". **Saya TIDAK menjalankannya lewat CDP** karena aturan repo melarang harness CDP (:9223) dijalankan → jalur ini tidak saya klaim apa pun. `cek-pengetahuan-live.mjs` juga tidak dijalankan (sekelas CDP). |

## 6. Sisa yang BELUM (ringkas)

1. **D2/D3** — `BATAS_KARAKTER_SUNTIK` belum mengekang TOTAL blok; opsi `batasKarakter` bukan batas total. → patch di `docs/USULAN-PENGETAHUAN-ANGKA.md` §U1–U3.
2. **F5/G4** — indeks bundel **BASI** (hash `f83cc022d0c620db` vs `26e682bb085f4c80`; 6212 vs 6253 entri). Regenerasi `src/lib/zephyrIndeks.ts` adalah wewenang pemilik (generator DILARANG saya sentuh).
3. **F6** — kebasian **hash** tidak pernah ditegakkan di runtime; keluaran tidak bilang BASI. → §U4–U5.
4. **C6** — cache per sesi belum ada di jalur suntikan otomatis (`zephyrCari`). → §U6.
5. **§4.6** — kepala/header 1 panggilan `zephyr_self` di luar cap 800 token. → §U7.
