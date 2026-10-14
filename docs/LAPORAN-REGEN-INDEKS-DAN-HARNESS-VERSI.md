# LAPORAN — REGEN INDEKS + TAMBALAN HARNESS VERSI INDEKS

Tanggal: 2026-10-14 · Repo: `D:/Zephyr` (branch `feat/ai-panel-vscode-layout`)
Pelaksana: agen induk (bukan lane) · 0 lane hidup saat dikerjakan (`delegate_task list` = kosong), jadi `src/**` SEPI.

Dokumen ini memuat ANGKA NYATA hasil perintah yang dijalankan sendiri oleh agen induk, plus teks lama/baru verbatim untuk satu berkas yang dipatch (`scripts/uji-versi-indeks.mjs`). Tidak ada angka dari ingatan/klaim lane.

---

## Ringkasan vonis

| Butir | Sebelum | Sesudah | Vonis |
|---|---|---|---|
| Indeks/fakta basi (`zeph-indeks-regen`) | cap `f83cc022d0c620db` vs nyata, 6212 entri, `--check` exit 1 | cap `836ab9dd159dd737`, **6254 entri**, `--check` sinkron | **TERTUTUP** (regen dijalankan) |
| `cek-batas-inti.mjs` | EXIT=1 (`zephyrIndeks.ts TIDAK SINKRON`) | **EXIT=0 LULUS** — blok inti 7950 char ≈ 1988 token (ambang 2000) | **TERTUTUP** |
| `cek-indeks-sinkron.mjs` | keluhan (entri tertinggal 41) | **SINKRON — 0 keluhan** (429/429 berkas, 0 baris geser, 6254 entri) | **TERTUTUP** |
| `uji-pengetahuan-angka.mjs` | 52/54 (F5 + G4 merah) | **54/54 LULUS, EXIT=0** | **TERTUTUP** |
| `uji-versi-indeks.mjs` | 18/18 pre-regen → **16/18** sesudah regen | **18/18 LULUS, EXIT=0** | **TERTUTUP** (harness dipatch dua arah; bukan produk) |
| `uji-blok-inti.mjs` | 37/37 | **37/37** (id 1996 tok / en 1982 tok) | tidak ada regresi |
| `tsc --noEmit --incremental false` | 0 galat | **0 galat** (TSC_EXIT=0, 0 baris keluaran) | tidak ada regresi |
| Jalur LIVE lewat app (CDP `:9223`) | app MATI (`CURL_EXIT=7`) | masih MATI | **BUTUH APP** (tidak dikerjakan di sini) |

Tidak ada `git add` / `git commit` / `git clean` dijalankan.

---

## 1. Regen indeks (item `zeph-indeks-regen`)

Prasyarat brief: tunggu SEMUA lane berhenti sebab `src/lib/zephyrIndeks.ts` & `src/lib/zephyrFakta.ts` adalah berkas hasil generator (dilarang disunting tangan, dilarang di-regen saat lane menyunting `src/**`).
Prasyarat itu **terpenuhi**: `delegate_task action='list'` → 0 lane hidup; `git status` menunjukkan tidak ada penyunting `src/**` yang berjalan.

Backup dibuat SEBELUM regen (di luar repo, supaya tidak mengotori git):

```
$ stat -c '%n %s byte' src/lib/zephyrIndeks.ts src/lib/zephyrFakta.ts $TMPDIR/indeks-sebelum.ts $TMPDIR/fakta-sebelum.ts
src/lib/zephyrIndeks.ts 1065952 byte
src/lib/zephyrFakta.ts 9851 byte
C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/rv115/../indeks-sebelum.ts 1047451 byte
C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/rv115/../fakta-sebelum.ts 9851 byte
```

Regen dijalankan apa adanya:

```
$ node scripts/gen-fakta-zephyr.mjs
REGEN_EXIT=0
```

Cakupan sesudah regen:

```
$ node scripts/gen-fakta-zephyr.mjs --print-cakupan
versi 1.1.13 · hashSumber 836ab9dd159dd737
total entri: 6254
  bridge 1 · dokumen 176 · ekstensi 17 · kode 429 · label 3023 · layar 1992
  menu 122 · panel 22 · perintah 179 · pintasan 66 · port 4 · seksi 31
  setelan 124 · tool 68
```

Selisih ukuran berkas (bukti bahwa regenerasi benar-benar menulis ulang berkas hasil):

```
zephyrIndeks.ts : 1.047.451 byte -> 1.065.952 byte  (+18.501 byte)
zephyrFakta.ts  :     9.851 byte ->     9.851 byte  (tidak berubah)
```

Catatan satuan (supaya tidak salah klaim): `ls -l`/`stat` melaporkan **byte**; `cek-batas-inti.mjs` melaporkan **karakter**. Untuk berkas yang sama sesudah regen: `zephyrIndeks.ts` = 1.065.952 byte = **1.051.440 karakter**, `zephyrFakta.ts` = 9.851 byte = **9.843 karakter**. Selisih = karakter multibyte UTF-8 (label UI berbahasa Indonesia + tanda baca tipografis).

---

## 2. Harness penjaga indeks (dijalankan ulang sesudah regen)

### 2.1 `cek-batas-inti.mjs` — dulu EXIT=1, sekarang LULUS

```
$ node scripts/cek-batas-inti.mjs
CEK BATAS INTI (pengetahuan dua lapis, ai-tahu-100-7)
  OK    ukuran blok inti                   7950 char ~ 1988 token (ambang 8000 char ~ 2000 token)
  OK    inti menyebut zephyr_self          ya
  OK    zephyr_self dikirim selalu         ya (26 tool selalu dikirim)
  OK    kategori indeks terisi             6254 entri; bridge=1 dokumen=176 ekstensi=17 kode=429 label=3023 layar=1992 menu=122 panel=22 perintah=179 pintasan=66 port=4 seksi=31 setelan=124 tool=68
  OK    indeks sinkron dengan sumber       sinkron: zephyrFakta.ts 9843 byte + zephyrIndeks.ts 1051440 byte (6254 entri; bridge=1, dokumen=176, ekstensi=17, kode=429, label=3023, layar=1992, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=68).
  VERDICT: LULUS (1988 token <= 2000)
BATAS_EXIT=0   (7 baris, apa adanya)
```

### 2.2 `cek-indeks-sinkron.mjs` — SINKRON, 0 keluhan

```
$ node scripts/cek-indeks-sinkron.mjs
   ringkas basi: berkas hilang 0 · baris geser 0 · simbol hilang 0 · entri rusak 0
  ok   semua berkas sumber punya entri peta kode (429/429)

3. cakupan label UI (kamus + permukaan komponen)
  ok   kunci kamus punya entri label (2761/2761)
   entri permukaan per berkas komponen: 141/158 (sisanya tanpa teks yang dibaca user, mis. src/components/ai/AiIkon.tsx, src/components/ai/CmdIkon.tsx, src/components/ai/DragonIcon.tsx, ...(+14))
  ok   label/teks permukaan bisa dicari (3186/3186)
   kamus 2761 kunci -> 3020 entri label; permukaan 158 berkas -> 3186 teks unik

4. jumlah entri per jenis (total 6254)
   bridge=1, dokumen=176, ekstensi=17, kode=429, label=3023, layar=1992, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=68
   label unik=3020, teks label unik=2849

SINKRON - 0 keluhan
SINKRON_EXIT=0
```

### 2.3 `uji-pengetahuan-angka.mjs` — 52/54 -> 54/54 (dua merah F5/G4 tutup oleh regen)

```
$ node scripts/uji-pengetahuan-angka.mjs
  - blok inti terukur 7984 char (~1996 token) dari ambang 2000 token: inti LULUS.
  SKOR KEPATUHAN: 54/54 diperiksa
  VERDICT UJI PENGETAHUAN ANGKA: LULUS
ANGKA_EXIT=0
```

F5 (hash sumber bundel == hash sumber saat ini) dan G4 (bundel == generator) hijau tanpa menyentuh kode lane mana pun — satu-satunya sebab keduanya merah dulu adalah indeks basi, dan akarnya sudah ditutup di §1.

### 2.4 `uji-blok-inti.mjs` — 37/37 (tidak ada regresi)

```
$ node scripts/uji-blok-inti.mjs
Ringkas: blok inti id 7984 char / 1996 tok, en 7925 char / 1982 tok (ambang 2000 tok).
EXIT=0
```

### 2.5 `tsc --noEmit --incremental false -p D:/Zephyr`

```
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
(keluaran kosong)   TSC_EXIT=0 · 0 baris
```

---

## 3. Tambalan harness `scripts/uji-versi-indeks.mjs` (16/18 -> 18/18)

### 3.1 Diagnosis: dua merah itu EKSPEKTASI BASI, bukan regresi produk

Sesudah regen yang SAH, `uji-versi-indeks.mjs` turun dari 18/18 ke 16/18. Dua yang merah:

* **kasus 11** — menuntut `deteksiBasi(capTersimpan, capNyata).basi === true`, yaitu mengunci keadaan "repo WAJIB basi".
* **kasus 12** — menuntut `adaBuktiBasi === true` (harus ada berkas/entri tertinggal), yaitu mengunci keadaan "repo WAJIB tidak sinkron".

Keduanya **mustahil** dipenuhi oleh repo yang baru saja di-regenerate dengan benar — di mana `cek-indeks-sinkron.mjs` melaporkan SINKRON 0 keluhan. Jadi yang salah adalah ekspektasi harness (satu arah: hanya menguji keadaan basi), bukan produknya. Ini bukan pelunakan: setelah dipatch, harness justru menguji **kedua** keadaan.

### 3.2 Teks baru (verbatim, apa yang tertulis di berkas sekarang)

Kasus 11:

```
  ok    11. deteksi basi: cap beda -> basi, cap sama -> segar
         - cap tersimpan 1.1.13/836ab9dd159dd737 vs cap nyata 1.1.13/836ab9dd159dd737 -> bedaCap=false; tersimpan vs nyata -> basi=false (WAJIB = bedaCap); tersimpan vs tersimpan -> basi=false; hash dibuat 0000 -> basi=true; versi dibuat 0.0.0 -> basi=true
```

Kasus 12:

```
  ok    12. jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata
         - cap tersimpan 1.1.13 / 836ab9dd159dd737 vs cap nyata 1.1.13 / 836ab9dd159dd737; berkas sumber tanpa entri peta kode 0 dari 429, baris bergeser di 0 berkas, label tak terjangkau 0, entri 6.254 tersimpan vs 6.254 nyata (tertinggal 0: ), keluhan cek-indeks-sinkron 0; capSama=true -> wajib semua angka tertinggal 0 DAN keluhan 0 (segar=true)
```

Ringkas akhir harness:

```
$ node scripts/uji-versi-indeks.mjs
uji-versi-indeks: 18/18 lulus, 0 gagal, 0 dilewati - cap tersimpan 1.1.13 / 836ab9dd159dd737 vs cap nyata 1.1.13/836ab9dd159dd737; tertinggal 0 berkas peta kode dari 429 dan 0 entri
EXIT=0
```

Bentuk aturan sesudah patch (dua arah, bukan dilunakkan):

* cap tersimpan == cap nyata → WAJIB 0 berkas tanpa entri, 0 baris bergeser, 0 label tak terjangkau, 0 selisih entri, 0 keluhan `cek-indeks-sinkron` (keadaan "segar").
* cap tersimpan != cap nyata → WAJIB ada bukti basi (`basi === true` + angka tertinggal > 0).
* Kontrol sintetis ditambahkan agar arah "basi" tetap teruji walau repo sedang segar: cap palsu `hash='0000000000000000'` + versi `'0.0.0'` harus menghasilkan `basi === true`.

### 3.3 Keluhan yang TIDAK diperbaiki (jujur)

`uji-versi-indeks.mjs` kasus 11 sempat memuat komentar yang menuliskan aturan lama ("dulu: menuntut basi===true"). Komentar itu kini menjelaskan aturan baru — arah lama tetap tercatat di komentar, jadi jejaknya tidak hilang.

---

## 4. TERBUKTI tanpa app vs BUTUH APP

**TERBUKTI tanpa app (node murni, dijalankan di giliran ini):**

1. Regenerasi indeks benar-benar menulis ulang berkas hasil (ukuran naik 18.501 byte; cakupan 6254 entri terbaca dari `--print-cakupan`).
2. Indeks sesudah regen SINKRON dengan sumber menurut DUA detektor independen: `cek-indeks-sinkron.mjs` (0 keluhan, 429/429 berkas) dan `cek-batas-inti.mjs` (blok inti 1988 token ≤ 2000, menyatakan "indeks sinkron dengan sumber").
3. Dua merah `uji-pengetahuan-angka.mjs` (F5 hash, G4 jumlah entri) tertutup: 52/54 → **54/54**.
4. Blok inti tetap di bawah ambang: 7950 char ≈ 1988 token (`cek-batas-inti`) / 7984 char = 1996 token (`uji-blok-inti`) — dua pengukur berbeda, keduanya ≤ 2000.
5. Harness versi-indeks menguji dua arah dan lulus 18/18, dengan cap tersimpan == cap nyata **dan** dengan cap sintetis basi (kontrol positif) tetap teruji.
6. `tsc --noEmit --incremental false` 0 galat.

**BUTUH APP (belum, tidak diklaim):**

1. Bahwa blok inti yang DIKIRIM KE MODEL sungguhan benar-benar 1988–1996 token (yang diukur: teks blok, bukan hitungan token provider).
2. Jalur "indeks saya basi, mau saya segarkan?" di UI (`zeph-versi-indeks-patch` usulan #4) — belum ada tombolnya.
3. 5 harness CDP (`verify-tool-gate.mjs`, `uji-batas-tulis.mjs`, `verify-tool-inti.mjs`, `uji-trim-tool.mjs`, `cek-aturan-operasional.mjs`) — app Zephyr MATI (`curl -s -m 3 http://127.0.0.1:9223/json/version` → kosong, `CURL_EXIT=7`; proses zephyr = 0), jadi di-SKIP oleh `uji-izin-semua.mjs` (exit 2, "SEBAGIAN TIDAK DIUJI").
4. Bahwa cue "indeks basi" benar-benar sampai ke percakapan nyata dengan model (butuh app hidup).

---

## 5. Sisa / tindak lanjut

1. `audit-katalog-tool.mjs` masih EXIT=1: `DIKIRIM_SELALU` 26 > `TARGET_MAKS` 20 (item `katalog-langit-langit`, keputusan pemilik). Ditemukan juga: temuan "1 nama katalog tanpa handler: zephyr_kode" adalah **celah deteksi audit** (`BERKAS_HANDLER` hanya membaca `builtins.ts` + web + mcp, sedangkan handler `zephyr_kode` tinggal di `agentTools.ts` — sudah diakui di komentar kepala skrip), bukan regresi.
2. `uji-fetch-web-rencana.mjs` masih mencetak "celah kode produk: 4 (bagian B) menunggu patch" padahal `uji-pane-browser.mjs` melaporkan CELAH 0 → label basi (item `uji-fetch-web-rencana-label`).
3. Sisa BUTUH APP murni tetap dilacak di item `bukti-live-app-sapu` dan `lama-pane-uji`/`lama-kurs`.
