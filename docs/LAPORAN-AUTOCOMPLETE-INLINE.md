# LAPORAN — AutoComplete Inline (ZEPH-AUTOCOMPLETE-INLINE)

Tanggal: 2026-10-14 · Repo: `D:\Zephyr` · Editor nyata: **CodeMirror 6** (bukan Monaco — lihat catatan).

---

## 0. Vonis singkat

| Pertanyaan | Vonis |
|---|---|
| Apakah Zephyr sudah punya mesin saran-sebaris? | **SUDAH ADA SEBELUMNYA** (`ghostText.ts`, `ghostPemasok.ts`, `dekorasiCopilot.ts`). Bukan greenfield. |
| Yang kurang apa? | **(a) seam pemasok lokal `ghostPemasok` belum disambung** ke `mintaSaran`; **(b) single-flight + anggaran byte payload belum ada.** |
| Yang dikerjakan sesi ini | **(a) DISAMBUNG** (diperbaiki) · **(b) DIBANGUN** (`autocompleteInline.ts`) |
| Level bukti | **Harness-level, bukan live-app.** Tidak ada klaim "muncul di app" — lihat §6. |

Kalimat kunci: **jangan tulis "TIDAK ADA"** — mesinnya ada. Yang dikerjakan adalah **menyambungkan seam + menutup dua celah governorship.**

---

## 1. Angka nyata (semua dari keluaran harness apa adanya)

Harness dijalankan ulang di akhir sesi (perintah: `node scripts/<berkas>.mjs`):

| Harness | Hasil | Exit |
|---|---|---|
| `scripts/uji-autocomplete-inline.mjs` (**baru**, 26 kasus) | **26/26 LULUS, 0 GAGAL** | 0 |
| `scripts/uji-autocomplete-rencana.mjs` (milik user, **ditambah** 4 kasus → 15) | **15/15 LULUS, 0 GAGAL** | 0 |
| `scripts/uji-replace-multi-berkas.mjs` (regresi) | **26/26 LULUS** | 0 |
| `scripts/uji-munculin-ui-rencana.mjs` (regresi) | **15 lulus, 0 gagal** | 0 |

### 1a. Byte payload (kasus P2 — berkas besar, jendela kecil)

```
P2  payload terukur KECIL untuk berkas besar:
    berkasChar=33379  jendelaChar=503  bytePayload=554  BATAS_BYTE_PAYLOAD=2048
P3  payload TIDAK memuat seluruh berkas (sentinel di kepala absen):
    sentinelDiBadan=false  jendelaChar=251
P9  byte dihitung UTF-8 apa adanya (char != byte) & tetap <= batas:
    byte a/é/😀 = 1/2/4  payloadLebar=1653 byte  char=813
```

Angka kunci: berkas uji **33.379 char** → yang dikirim hanya **554 byte** (jendela 503 char). **Payload 1,7% dari berkas.** Batas keras **2048 byte**.

### 1b. Batas jendela & determinisme

```
P1  payload non-null, jendela = sufiks, baris & bahasa benar   baris=2 bahasa="ts" byte=...
P4  jendela <= BATAS_JENDELA_BARIS                              barisJendela=12 BATAS=12
P5  jendela <= BATAS_JENDELA_KARAKTER                           jendelaChar=1200 BATAS=1200
P7  determinisme: input sama -> badan & byte IDENTIK          badanSama=true byteSama=true
P8  baris terlalu pendek / kosong -> null                      kosong=null pendek=null
```

### 1c. Sakelar & single-flight & batal-saat-ketik (negatif)

```
N1  tombol MATI -> nol permintaan                              kirim=0/50  alasan=mati
N3  SINGLE-FLIGHT: permintaan kedua ditolak saat pertama terbang d1=ok d2=terbang terbang=true
N5  BATAL-SAAT-KETIK (negatif): tiket lama basi                lama=batal-ketik baru=ok
N7  setAktif(false) saat terbang -> terbang dibatalkan & "mati" terbang=false alasan=mati
N9  user mengetik cepat: 30 ketikan -> 1 kirim (tak menumpuk)   kirim=1 ditolak=29
```

### 1d. Uji negatif rahasia (tidak ada isi berkas rahasia di usulan)

```
P6  rahasia disamarkan: "***" ada, nilai rahasia absen di badan  bocor=false adaMasker=true
A14 (rencana) NEGATIF: seam lokal tidak membocorkan rahasia     bocor=false teks="const k = '***';"
A2  (rencana) usulan TIDAK boleh memuat isi berkas rahasia      saring="apiKey = \"***\"" usulan="const t='***';"
```

---

## 2. Bukti "satu saran NYATA muncul" (bukan klaim)

Dari seam lokal `PEMASOK_LOKAL` (`ghostPemasok.ts`), dipanggil `ambilSaran('function tambah(a, b) {', 'ts', { path: 'a.ts' })`:

```
A12  saran NYATA muncul dari seam lokal   teks="\n}"  sebab=tutup-blok  dari=23
```

Saran nyata: mengetik `function tambah(a, b) {` → seam mengusulkan `"\n}"` (alasan `tutup-blok`, posisi 23). Deterministik (A7: input sama → usulan sama). Ini dijalankan lewat bundel modul produk nyata (esbuild), bukan salinan.

---

## 3. Yang SUDAH ADA SEBELUMNYA (mesin, tidak dibangun ulang)

- `src/lib/ghostText.ts` (437 baris) — `mintaSaran` (≈L208), debounce **JEDA_MS=700** + `setTimeout/clearTimeout` (batal saat ketik), jendela **KONTEKS_BARIS=40**, sakelar `ghostText(on)` (L427).
- `src/lib/ghostPemasok.ts` (≈18,6 KB) — `PEMASOK_LOKAL`, `ambilSaran(sebelum,bahasa,kunci)`, `saringRahasia(teks,rahasia)`, `setPemasokSaran`. Default = `PEMASOK_MATI` (selalu `null`).
- `src/components/editor/dekorasiCopilot.ts` — lapisan dekorasi.
- Harness `uji-autocomplete-rencana.mjs` (milik user) sudah hijau 11/11 sebelum sesi ini.

Fakta wiring S3/S6/S7 (dari sumber nyata):

```
S2  ghostText mengirim JENDELA (doc.line), bukan berkas penuh   doc.line=true doc.toString=false
S3  sakelar on/off ADA: ghostText(on) -> [] saat off            off->[]=true
S6  editor = CodeMirror, BUKAN Monaco                           @codemirror=true monaco=false
S7  angka batas: ghostText KONTEKS_BARIS=40 | baru BARIS=12 KARAKTER=1200 BYTE=2048
```

---

## 4. Yang DIPERBAIKI sesi ini (sambungan seam)

Sebelum: `mintaSaran` memanggil `cmd.aiChat` langsung (≈L242) dan `ghostPemasok` **tidak diimpor berkas app mana pun**. Sesudah (4 tambalan di `src/lib/ghostText.ts`, tanpa menyentuh `zephyrIndeks.ts`/`zephyrFakta.ts`):

```
L15   import { ambilSaran, PEMASOK_LOKAL, setPemasokSaran } from './ghostPemasok';
L220  const lokal = await ambilSaran(konteksSekitar(view), bahasa, { path });
L221  if (lokal) {  ... tampilkan(lokal.teks.split('\n')[0]); return; }   // LOKAL DULU
L259  await cmd.aiChat({ ... })                                            // AI = CADANGAN
L425  setPemasokSaran(PEMASOK_LOKAL);                                      // dipasang sekali
```

Bukti urutan & jalur (dari sumber, rencana harness):

```
A13  idxAmbilSaran=7207  <  idxAiChat=8564   earlyReturn=true   (lokal mendahului AI)
A15  idxLokalReturn=7268 <  idxPastikanListener=8034 (listener jaringan HANYA di jalur AI)
A6   impor seam=true  pasangLokal=true  ambilSaran=true  cadanganAi=true
```

Artinya: bila seam mengembalikan usulan → tampil & `return` (jaringan tak disentuh); bila `null` → jatuh ke jalur AI seperti semula → **tanpa regresi**.

---

## 5. Yang BARU DIBANGUN sesi ini (dua celah govemorship)

`src/lib/autocompleteInline.ts` (206 baris), **murni & sinkron** (tanpa jaringan/timer/I-O, agar bisa diuji di Node):

- **Anggaran byte payload** — `BATAS_BYTE_PAYLOAD=2048`, `bytePanjang()` (UTF-8 apa adanya, char≠byte), `jendelaKonteks()` (sufiks ≤ `BATAS_JENDELA_BARIS=12` baris & ≤ `BATAS_JENDELA_KARAKTER=1200` char), `bangunPermintaan()` (tolak kalau baris terakhir < `PANJANG_MINIMUM_BARIS=3`).
- **Governor single-flight + batal-saat-ketik** — `ketik/tiket/putuskanKirim/mulaiKirim/selesaiKirim/setAktif`; alasan prioritas **`mati > batal-ketik > terbang > ok`**.

Bukti kemurnian (S5): `waktu=false timer=false jaringan=false impor=["import { saringRahasia } from './ghostPemasok';"]`.

---

## 6. Batas bukti (apa adanya)

- **Semua bukti di atas adalah harness-level.** Harness membundel **modul produk ASLI** (`autocompleteInline.ts` + `saringRahasia` dari `ghostPemasok.ts`) via **esbuild** dan membaca **sumber nyata** (`ghostText.ts`, `ghostPemasok.ts`, `CodeMirrorEditor.tsx`, `package.json`) sebagai teks. Tidak ada salinan/fixture tiruan.
- **Tidak ada bukti live-app.** Tidak ada klaim "saran muncul di UI". Harness CDP (:9223) **sengaja tidak dijalankan** — lane lain sedang menyunting `src/**`.
- **`npx tsc --noEmit`:** 4 galat, **0 di antaranya di berkas yang saya sentuh** (`ghostText.ts`, `autocompleteInline.ts` tidak muncul). 4 galat berasal dari berkas lane lain yang sedang disunting (lihat §7). Baseline sebelum sesi ini = **0 galat**.

---

## 7. `npx tsc --noEmit` — apa adanya

Baseline (sebelum tambalan): **exit 0, 0 galat**. Setelah tambalan, galat di berkas **lane lain** muncul/hilang antar-run (bukti lane lain aktif menyunting `src/**`, bukan efek tambalan saya):

```
src/lib/bacaKode.ts(154,24): error TS2304: Cannot find name 'BATAS_BERKAS_PER_PANGGILAN'.
src/lib/providerTahan.ts(568,7): error TS6133: 'tungguJendelaMs' is declared but never read.
src/lib/providerTahan.ts(689,9): error TS2741: Property 'jendela' is missing in type 'HasilTahan<T>'.
src/lib/providerTahan.ts(833,3): error TS2741: Property 'jendela' is missing in type 'HasilTahan<T>'.
```

Pemeriksaan: `tsc 2>&1 | grep -E "ghostText|autocompleteInline"` → **(none)**. Galat murni milik lane lain (`bacaKode.ts`, `providerTahan.ts`); tak satu pun di berkas sesi ini. Sesi ini **tidak menyentuh** kedua berkas itu.

---

## 8. Berkas yang disentuh sesi ini

| Berkas | Aksi |
|---|---|
| `src/lib/ghostText.ts` | **diubah** — 4 tambalan sambungan seam (L15, L220–221, L259, L425) |
| `src/lib/autocompleteInline.ts` | **baru** — 206 baris (anggaran byte + governor) |
| `scripts/uji-autocomplete-inline.mjs` | **baru** — 413 baris, 26 kasus |
| `scripts/uji-autocomplete-rencana.mjs` | **ditambah** — A6 diperkuat + A12–A15 (11 → 15 kasus) |

Tidak ada `git add`/`git commit`; tidak ada wildcard di `scripts/`; `zephyrIndeks.ts`/`zephyrFakta.ts` tidak disentuh; harness CDP tidak dijalankan.
