# USULAN PENGETAHUAN ANGKA — AI-TAHU-100-7

Usulan patch untuk tuntutan yang **belum** terpenuhi (lihat `docs/LAPORAN-PENGETAHUAN-ANGKA.md` §6).
Semua nomor baris diverifikasi pada branch `feat/ai-panel-vscode-layout` (2026-10-14).
Angka "sebelum" = hasil ukur harness; angka "sesudah" = **perkiraan aritmetika, belum diukur** karena
`src/**` READ-ONLY bagi saya (dinyatakan eksplisit, bukan klaim bukti).

---

## U1 — (d/D2) penutup ikut dibayar dari `BATAS_KARAKTER_SUNTIK`

Berkas: `src/lib/zephyrCari.ts` · baris **570–571**

Teks lama:
```ts
  const baris: string[] = [];
  let panjang = kepala.length + meta.length + 2;
  const jatah = batasKarakter - 4;
```

Teks baru:
```ts
  const baris: string[] = [];
  let panjang = kepala.length + meta.length + 2;
  /* AI-TAHU-100-7: penutup WAJIB ikut dibayar dari anggaran. Tanpa ini blok
   * yang beredar melebihi batasKarakter sebesar panjang penutup
   * (terukur: 12/60 kueri, kelebihan maks 376 char). */
  const jatah = batasKarakter - 4 - penutup.length - 1;
```

Akibat: blok total ≤ `batasKarakter` (maks 1576 → ≤1200) dengan konsekuensi **0–4 entri lebih sedikit**
di kueri yang sebelumnya lewat batas. Sebelum: 12/60 lewat, kelebihan maks 376 char. Sesudah (perkiraan): 0/60 lewat.
Risiko: rendah — hanya memangkas entri ekor, kepala/meta/penutup tetap utuh (sesuai niat komentar `:451`).

---

## U2 — (d/D3) `batasKarakter` yang kecil tidak bisa dipenuhi kepala+meta+penutup

Berkas: `src/lib/zephyrCari.ts` · baris **513–517** (clamp) dan **559–567** (penutup)

Masalah terukur: `batasKarakter: 300` → blok **654 char**. Yang bisa dipangkas hanya entri; kepala (76) +
meta (~226) + penutup (351) sudah melewati 300. Jadi opsi itu kini hanya mengontrol bagian entri.

Teks lama (513–517):
```ts
export function suntikanIndeks(kueri: string, opsi: OpsiSuntikan = {}): string {
  const batasKarakter = Math.max(
    300,
    Math.min(BATAS_KARAKTER_HASIL, Math.floor(opsi.batasKarakter ?? BATAS_KARAKTER_SUNTIK)),
  );
```

Teks baru (utuh — potong penutup jadi INTI + TAMBAHAN, lalu lantai anggaran = bagian wajib):
```ts
export function suntikanIndeks(kueri: string, opsi: OpsiSuntikan = {}): string {
```

…dan ganti blok `penutup` (559–567) dengan:
```ts
  /* AI-TAHU-100-7: penutup dipisah jadi inti (wajib, tidak pernah dipotong) dan
   * tambahan (hanya kalau anggaran masih muat) supaya opsi batasKarakter
   * benar-benar bisa dihormati sampai sekecil apa pun. */
  const penutupInti =
    'These entries come from Zephyr\'s own sources, so they outrank anything you remember about Zephyr. ' +
    'If the name the user asks for is not among them, call `zephyr_self` before naming it - never invent a setting, shortcut, command or port.';
  const penutupTambahan =
    ' They are a SLICE of the index, not the whole of it: read them in English, answer in the language the user wrote in.' +
    (caraBlok === 'nama'
      ? ' These matched on a NAME taken from the message (an identifier, setting, screen name or number); the other words of the sentence were NOT required to match - read each entry before you use it.'
      : '') +
    (caraBlok === 'longgar' ? ' These matched on PART of the words only, so treat them as a hint, not proof.' : '') +
    (total > hasil.length ? ` ${total} entries match in total, ${hasil.length} are shown.` : '');
  const panjangWajib = kepala.length + meta.length + penutupInti.length + 3;
  /* batasKarakter tidak boleh lebih kecil dari barang yang tidak bisa dipangkas. */
  const batasKarakter = Math.max(
    panjangWajib,
    Math.min(BATAS_KARAKTER_HASIL, Math.floor(opsi.batasKarakter ?? BATAS_KARAKTER_SUNTIK)),
  );
  const penutup = batasKarakter >= panjangWajib + penutupTambahan.length
    ? penutupInti + penutupTambahan
    : penutupInti;
```
(blok `const batasKarakter = Math.max(300, ...)` di 514–517 DIPINDAH ke sesudah penutup; urutan
`kepala`/`meta`/`caraBlok` sudah tersedia sebelum baris itu, jadi tidak ada ketergantungan melingkar.)

Sesudah (perkiraan): `batasKarakter: 300` → blok = kepala+meta+penutupInti ≈ **470 char**, bukan 654 char;
dan blok itu tidak bisa lagi lebih kecil dari bagian wajibnya. **Kalau pemilik menginginkan 300 benar-benar
dihormati sampai habis, kepala/meta juga harus bisa dipangkas — usulan ini sengaja TIDAK melakukannya** karena
meta memuat jumlah entri + versi + hash (bahan cap BASI), dan memangkasnya membatalkan tuntutan (f).
Konsekuensinya: asersi harness D3 (`total <= 300`) hanya bisa hijau kalau spesifikasinya diubah jadi
`total <= max(batasKarakter, panjangWajib)` — itu keputusan pemilik, bukan keputusan saya.

---

## U3 — (d) jalur "tidak ada hasil" juga tak punya anggaran

Berkas: `src/lib/zephyrCari.ts` · baris **534–556** (cabang `if (!hasil.length)`), khususnya `:556`

Terukur: kueri di luar Zephyr → blok **1028–1034 char** (≤1200, aman), kueri kosong → **644 char**.
Jadi cabang ini kebetulan masih di bawah batas, tetapi **tidak punya mekanisme anggaran sama sekali**:
ia menggabung kepala+meta+5 kalimat+penutup dan berharap muat.

Teks lama (555–556):
```ts
    baris.push(
      "For more, call `zephyr_self` with the user's own words: it searches this same index and returns more lines.",
    );
    return baris.join('\n');
```

Teks baru:
```ts
    /* AI-TAHU-100-7: cabang tanpa hasil juga tunduk pada batasKarakter -
     * kalimat bantuan dilewatkan kalau anggaran sudah habis. */
    const BARIS_BANTU =
      "For more, call `zephyr_self` with the user's own words: it searches this same index and returns more lines.";
    if (baris.join('\n').length + BARIS_BANTU.length + 1 <= batasKarakter) baris.push(BARIS_BANTU);
    return baris.join('\n');
```

Sesudah (perkiraan): panjang cabang tanpa hasil ≤ `batasKarakter`. Sebelum: tidak ada jaminan apa pun.

---

## U4 — (f/F6) keluaran runtime tidak pernah bilang BASI saat **hash** basi

Berkas: `src/lib/zephyrTools/zephyrSelf.ts` · baris **404**, **410–411**, **482**, **540**

Akar: semua deteksi BASI di runtime membandingkan **versi** (`vApp !== f.aplikasi` di `:404`,
`vApp !== vIndeks` di `:540`), **tidak pernah** membandingkan hash. Terukur: hash bundel
`f83cc022d0c620db` ≠ hash sumber sekarang `26e682bb085f4c80`, versi sama-sama 1.1.13 → `bagian=versi`
menjawab *"Kemutakhiran indeks: segar (sama dengan versi app yang berjalan)"* sementara `--check` exit 1.
**Jujur soal batasnya: aplikasi yang sudah terpasang tidak punya sumber repo, jadi ia TIDAK BISA menghitung
ulang hash sumber saat runtime.** Yang bisa dilakukan: menyatakan **dasar** cap itu apa adanya.

Teks lama (410–411):
```ts
  baris.push(`Indeks fakta bundel: versi ${f.aplikasi} - hash sumber ${f.hashSumber}`);
  baris.push(`Kemutakhiran indeks: ${basi ? `BASI - indeks dibuat untuk versi ${f.aplikasi}, aplikasi berjalan ${vApp}` : 'segar (sama dengan versi app yang berjalan)'}`);
```

Teks baru:
```ts
  baris.push(`Indeks fakta bundel: versi ${f.aplikasi} - hash sumber ${f.hashSumber}`);
  baris.push(
    `Kemutakhiran indeks: ${basi ? `BASI - indeks dibuat untuk versi ${f.aplikasi}, aplikasi berjalan ${vApp}` : 'segar menurut VERSI (sama dengan versi app yang berjalan)'}` +
      ' - hash sumber tidak bisa dihitung ulang dari dalam aplikasi; kesinkronannya diuji saat build oleh' +
      ' `node scripts/gen-fakta-zephyr.mjs --check` (exit != 0 = BASI).',
  );
```

Akibat: pembaca keluaran (model maupun manusia) langsung tahu bahwa "segar" di sini **hanya berarti versi**,
dan tahu perintah mana yang memutuskan kebasian hash. Ini menghapus klaim yang menyesatkan tanpa berpura-pura
memverifikasi hash. Sebelum: output menyatakan "segar" padahal hash basi. Sesudah (perkiraan): output
menyatakan dasar penilaiannya + cara memverifikasi.

---

## U5 — (f/F5, G4) indeks bundel BASI → gerbang build + regenerasi (wewenang pemilik)

Terukur sekarang: `hashSumber` bundel `f83cc022d0c620db` ≠ `26e682bb085f4c80` (hasil `--print-cakupan`),
`--check` exit 1; bundel **6212** entri vs generator **6253** (`kode +25`, `layar +16`).
Jadi ini **bukan** sekadar hash: isi indeks memang ketinggalan 41 entri.

5a. Gerbang build — berkas `package.json`, baris `"build": "tsc && vite build",`

Teks lama:
```json
    "build": "tsc && vite build",
```
Teks baru:
```json
    "build": "node scripts/gen-fakta-zephyr.mjs --check && tsc && vite build",
```
Akibat: build berhenti (exit 1) selama indeks tidak sinkron — cap hash jadi **ditegakkan**, bukan sekadar dicetak.
Sebelum: indeks basi bisa ter-bundle tanpa halangan. Risiko: rendah, tapi pemilik harus regenerasi dulu
sebelum build berikutnya (kalau tidak, build memang merah — itu tujuannya).

5b. Perintah uji — berkas `package.json`, sesudah `"verify": "node scripts/verify.mjs",`

Teks baru (sisipan):
```json
    "verify:pengetahuan-angka": "node scripts/uji-pengetahuan-angka.mjs",
```
Akibat: tuntutan (a)–(g) punya perintah resmi satu baris; `node scripts/uji-pengetahuan-angka.mjs` exit 0 = tuntas.

5c. **Tindakan pemilik yang tidak bisa saya lakukan** (generator DILARANG saya sentuh, `src/**` READ-ONLY):
```bash
node scripts/gen-fakta-zephyr.mjs          # regenerasi src/lib/zephyrIndeks.ts
node scripts/gen-fakta-zephyr.mjs --check   # harus exit 0
node scripts/uji-pengetahuan-angka.mjs      # F5 + G4 harus berubah jadi OK
```

---

## U6 — (c/C6) cache per sesi belum ada di jalur suntikan otomatis

Berkas: `src/lib/zephyrCari.ts` · fungsi `suntikanIndeks` (`:513`) — meniru pola yang SUDAH terbukti
bekerja di `src/lib/zephyrTools/zephyrSelf.ts:63,65,69,533,591`.

Teks baru (di dekat konstanta, pola sama seperti `CACHE_SESI`):
```ts
/* AI-TAHU-100-7: blok suntik deterministik per (kueri, anggaran, versi) ->
 * cache per sesi supaya giliran berikutnya dengan kueri sama tidak
 * menghitung ulang. Sesi baru WAJIB memanggil bersihkanCacheSuntikSesi(). */
const CACHE_SUNTIK = new Map<string, string>();
export function ukuranCacheSuntikSesi(): number { return CACHE_SUNTIK.size; }
export function bersihkanCacheSuntikSesi(): void { CACHE_SUNTIK.clear(); }
```
Di dalam `suntikanIndeks()`, sesudah `kepala`/`meta`/`v` dihitung dan sebelum `pecahKueri`:
```ts
  const kunciSuntik = `${kueri}|${batasKarakter}|${batas}|${v.aplikasi}|${v.hashSumber}`;
  const tersimpanSuntik = CACHE_SUNTIK.get(kunciSuntik);
  if (tersimpanSuntik !== undefined) return tersimpanSuntik;
```
…dan sebelum tiap `return` di akhir fungsi, `CACHE_SUNTIK.set(kunciSuntik, <hasil>)`.

Catatan jujur: blok ini **nol jaringan dan in-memory**, jadi cache di sini menghemat CPU, bukan jaringan;
**penghematan itu belum saya ukur** (yang terukur hanya jalur `zephyr_self`: MISS 4 IPC → HIT 2 IPC).
Kunci cache memuat `v.hashSumber` supaya blok hasil indeks lama tidak tersaji setelah indeks regenerasi.
Risiko: kalau pemanggil lupa membersihkan antar sesi, kueri sama bisa menyajikan blok sesi lama — karena itu
kunci memuat hash+versi, dan pembersihan harus disambungkan ke titik yang sama dengan `bersihkanCacheSesi()`.

---

## U7 — (b) kepala/header `zephyr_self` (242 char) dihitung di luar cap 800 token

Berkas: `src/lib/zephyrTools/zephyrSelf.ts` · baris **590** (perakitan keluaran), **126–127** (`potongKePotongan`),
deskripsi tool di **:494** dan **:504**.

Terukur: panggilan `bagian=fakta, maks:1` → muatan **3315 char**; kepala/header JSON **242 char**;
potongan murni **768 token** (3071 char). Jadi cap 800 dihormati per potongan, tetapi seluruh payload
1 panggilan ≈ **829 token** kalau kepalanya ikut dihitung (29 token di atas 800).

Teks lama (`:590`):
```ts
  const keluaran = `ZEPHYR_SELF ${JSON.stringify(header)}\n\n${kepala}${potongan.join('\n\n--- potongan berikutnya ---\n\n')}`;
```
Teks baru (kepala ikut dibebankan ke potongan pertama — signature `potongKePotongan` dapat argumen opsional):
```ts
  const kepalaJson = `ZEPHYR_SELF ${JSON.stringify(header)}\n\n`;
  /* AI-TAHU-100-7: kepala/header ikut dihitung sebagai bagian potongan pertama
   * supaya "<=800 token/potongan" berlaku untuk SELURUH muatan 1 panggilan. */
  const potongan = potongKePotongan(isi, maks, kepalaJson.length);
  const keluaran = `${kepalaJson}${kepala}${potongan.join('\n\n--- potongan berikutnya ---\n\n')}`;
```
…dengan `potongKePotongan(isi, maksDiminta, bebanAwal = 0)` di `:126` mengurangi jatah potongan pertama
sebesar `bebanAwal`. Alternatif yang lebih murah (kalau pemilik tidak mau mengubah signature): perbarui
deskripsi di `:494`/`:504` supaya menyebut **"<=800 token per potongan BADAN (kepala/header JSON di luar hitungan)"**
— jujur dan tidak mengubah perilaku. Sebelum: klaim "tiap potongan <= 800 token" ambigu (payload 829 token).
Sesudah (perkiraan): payload 1 panggilan ≤ ~800 token juga.

---

## Yang harus dilakukan pemilik repo (di luar wewenang saya)

1. **Regenerasi indeks** (WAJIB, penyebab F5/G4): `node scripts/gen-fakta-zephyr.mjs` → lalu `--check` harus exit 0.
   Saya dilarang menyentuh generator & `src/**`, jadi langkah ini memang bukan milik saya.
2. Terapkan U1–U3 (batas blok lapis 2 **total**), U4–U5 (BASI dari hash), U6 (cache sesi jalur suntik), U7 (kepala ikut dihitung) — sesuai prioritas pemilik.
3. Setelah tiap patch: `node scripts/uji-pengetahuan-angka.mjs` → target **43/43** (sekarang 38/43).
4. Kalau pemilik mengubah spesifikasi D3 (batas total vs "batas yang bisa dipangkas"), asersi D3 di harness
   harus disesuaikan — saya sengaja tidak "melunakkan" asersinya supaya merahnya tetap terbaca.

## Batas kejujuran dokumen ini

- Semua angka **"sebelum"** = keluaran nyata: `node scripts/uji-pengetahuan-angka.mjs` (38/43, exit 1),
  `node scripts/gen-fakta-zephyr.mjs --check` (exit 1), `--print-cakupan` (6253 entri / hash `26e682bb085f4c80`).
- Semua angka **"sesudah (perkiraan)"** = aritmetika dari angka ukur, **belum diukur**, karena `src/**` READ-ONLY bagi saya.
- `scripts/cek-pengetahuan-2lapis.mjs` (exit 2) dan `scripts/cek-pengetahuan-live.mjs` **tidak dijalankan**:
  keduanya butuh CDP `:9223`, yang dilarang aturan repo. Jalur itu tidak saya klaim apa pun.
- Saya tidak melakukan `git add`/`commit`/`clean` dan tidak menyentuh `src/**` maupun `src-tauri/**`.
