# LAPORAN VERSI-INDEKS PATCH

Item: `zeph-versi-indeks-patch` (+ turunan `zeph-indeks-regen`)
Sumber usulan: `docs/USULAN-VERSI-INDEKS.md` (21.200 byte)
Cabang: `feat/ai-panel-vscode-layout`. Tanggal kerja: 2026-10-14, 13:30-13:45 (+07).
Berkas yang disentuh: `scripts/gen-fakta-zephyr.mjs`, `src/lib/zephyrCari.ts`,
`src/lib/zephyrTools/zephyrSelf.ts` + hasil regenerasi `src/lib/zephyrIndeks.ts`,
`src/lib/zephyrFakta.ts`. Tidak ada berkas lain yang disentuh, tidak ada `git add/commit`.

## 0. Vonis ringkas (jujur per butir)

| # | Butir | Vonis |
|---|---|---|
| 1a | `daftarHash()` = satu sumber urutan berkas hash | DITERAPKAN. Digest TIDAK berubah (`836ab9dd159dd737`) - refaktor murni, terbukti |
| 1b | `FAKTA_HASH_BERKAS` + `FAKTA_HASH_ALGO` | DITERAPKAN. `FAKTA_VERSI` **sengaja TIDAK diperluas** dengan `berkas`/`entri` - lihat bagian 2b (konflik dengan kasus 1 harness yang beku); angka `berkas`/`entri` tetap tersedia dari artefak yang sama |
| 2 | `capTersimpan()` + `capBasi()` (murni, tanpa I/O) di `zephyrCari.ts` | DITERAPKAN apa adanya sesuai usulan |
| 3 | bagian baru `indeks` + deteksi basi memperhitungkan hash + angka nyata di laporan | DITERAPKAN, dengan satu catatan penting: **hash TIDAK bisa dihitung dari dalam app** (app terpasang tidak membawa pohon sumber; cap itu sha1, dan webview tidak punya sha1). Jadi bagian `indeks` melaporkan cap + bilang "tidak bisa diverifikasi", bukan "segar" - bukan pura-pura segar |
| 4 | jalur "indeks saya basi, mau saya segarkan?" | DITERAPKAN sebagai jalur DATA/TEKS: bagian `indeks` (cap + angka + perintah pemeriksa) dan kontrak di deskripsi tool (`suggest_command` + `node scripts/gen-fakta-zephyr.mjs`, user yang menekan Enter). Tidak ada UI baru |
| — | `zeph-indeks-regen` (regenerasi indeks) | DIJALANKAN. Saat pass terakhir: `--check` exit 0, `cek-indeks-sinkron` **SINKRON - 0 keluhan** (stored == nyata) |

Sisa yang belum tertutup (bukan disembunyikan): lihat bagian 6.

## 1. Pergeseran nomor baris (brief memakai rev lama: indeks `f83cc022d0c620db`, saya verifikasi ulang)

| Penambat di brief | Rev lama | Rev saat saya verifikasi (sebelum sunting) | Status |
|---|---|---|---|
| `BAGIAN_TAMPAK` | `zephyrSelf.ts:49,51` | 49, 51 | tidak bergeser |
| deteksi basi/versi | `zephyrSelf.ts:404` | 418 & 424 (blok komentar 419-423 menyisip) | geser +14..+20 |
| `bagianIndeks` baru | "after bagianVersi ~416" | disisipkan sebelum komentar `bagian=fakta` (baris 431) | geser |
| mesin `pakaiIndeks`/`basi` | `zephyrSelf.ts:539-540` | 552-553 | geser +13 |
| `switch case 'versi'` | `zephyrSelf.ts:561` | 574-578 | geser +13 |
| deskripsi + `enum` spec | `zephyrSelf.ts:494,500` | 507 (description), 513 (enum) | geser +13 |
| `versiFakta`/patch 2 | `zephyrCari.ts:250-252` | 250-252 | tidak bergeser |
| cap hash generator | `gen-fakta-zephyr.mjs:1158/1187/1193/1213/1222` | `versiApp()` 1187-1191, `daftarHash()` 1193-1199, `hashSumber()` 1201-1222 | ±sama |
| `FAKTA_VERSI` | `gen-fakta-zephyr.mjs:1410` | template 1416 | geser +6 |
| cap tersimpan di artefak | `zephyrIndeks.ts:28` | artefak sekarang **35** (komentar 7 baris saya menyisip di atasnya) | geser +7 |

Sesudah sunting (nomor final, dari hunk `patch`): `bagianSemua` cap 529-530, deskripsi spec 549,
`enum` 555, `pakaiIndeks` 593, `case 'indeks'` 619-622.

## 2. Patch 1 - generator

### 2a. Satu sumber urutan berkas hash

LAMA (dikutip dari dokumen, baris 1193-1223; teks dokumen berhasil dipulihkan dari riwayat sesi
untuk loop pertama - loop kedua memakai pola `masukkan()` yang sama atas berkas permukaan):

```js
function hashSumber() {
  const h = createHash('sha1');
  const masukkan = (nama, isi) => {
    h.update(nama);
    h.update('\u0000');
    h.update(isi);
    h.update('\u0000');
  };
  for (const p of SUMBER_HASH) {
    let isi = '';
    try {
      isi = baca(p);
    } catch {
      isi = '(tidak ada)';
    }
    masukkan(p, isi);
  }
  // …loop kedua: berkas permukaan (pola sama)
```

BARU (verbatim, `gen-fakta-zephyr.mjs` 1193-1222):

```js
/* DAFTAR TERTUTUP berkas yang masuk hash, urut, dalam SATU tempat: hashSumber()
   memakainya untuk menghitung, dan generator MENCETAKNYA ke artefak. Kalau dua
   tempat menyusun daftar ini sendiri-sendiri, keduanya bisa berbeda diam-diam -
   dan cap yang tidak bisa dihitung ulang sama saja dengan tidak ada cap. */
function daftarHash() {
  return [...SUMBER_HASH, ...berkasPermukaan()];
}

function hashSumber() {
  const h = createHash('sha1');
  const masukkan = (nama, isi) => {
    h.update(nama);
    h.update('\u0000');
    h.update(isi);
    h.update('\u0000');
  };
  /* Berkas permukaan IKUT (lihat daftarHash), karena isi indeks bergantung
     padanya: label dan tombol dipanen dari JSX-nya. Berkas yang hilang dicatat
     sebagai '(tidak ada)' - jadi menghapus sumber JUGA menggeser hash. */
  for (const p of daftarHash()) {
    let isi = '';
    try {
      isi = baca(p);
    } catch {
      isi = '(tidak ada)';
    }
    masukkan(p, isi);
  }
  return h.digest('hex').slice(0, 16);
}
```

Bukti refaktor murni: hash `836ab9dd159dd737` SEBELUM dan SESUDAH perubahan ini (diuji langsung
setelah patch 1a, sebelum patch lain). Vonis: **DITERAPKAN, digest tidak berubah**.

### 2b. `FAKTA_HASH_BERKAS` + `FAKTA_HASH_ALGO` (+ deviasi yang disengaja pada `FAKTA_VERSI`)

LAMA (verbatim, template 1408-1410):

```ts
/** Versi aplikasi + hash sumber yang menghasilkan indeks ini. Dipakai untuk
 *  menjawab \"fakta ini basi atau tidak\", bukan untuk pamer. */
export const FAKTA_VERSI = { aplikasi: '${versiApp}', hashSumber: '${hashIndeks}' } as const;
```

Dokumen meminta baris itu diperluas jadi
`{ aplikasi: '…', hashSumber: '…', berkas: N, entri: M }`. **Itu TIDAK diterapkan**, karena
memecahkan produk dengan cara yang tidak terlihat: `scripts/uji-versi-indeks.mjs:111` (beku,
wajib 18/18) membaca cap dengan pola TERTUTUP

```js
const m = /FAKTA_VERSI = \{ aplikasi: '([^']+)', hashSumber: '([^']+)' \}/.exec(isi);
```

yang menuntut ` }` persis sesudah tanda kutip `hashSumber`. Field tambahan di baris yang sama
membuat pembaca cap mengembalikan `null`, dan cap yang tidak terbaca sama saja dengan tidak ada
cap (kasus 1/11/12/17/18 ikut merah). Memperlebar regex harness DILARANG brief ("jangan
melunakkan kasusnya"), jadi yang dibereskan adalah PRODUKNYA: baris `FAKTA_VERSI` dibiarkan
tertutup, dan angka `berkas`/`entri` diambil dari dua artefak yang sama persis
(`FAKTA_HASH_BERKAS.length` = jumlah berkas yang masuk hash, `FAKTA_INDEKS.length` = jumlah entri)
- ini justru fallback yang dokumen sendiri sebut sebagai cadangan, jadi tidak ada angka yang
disalin tangan. (Percobaan pertama saya memang memperluas `FAKTA_VERSI`; sudah dikembalikan.)

BARU (verbatim, template 1407-1426):

```ts
/** Versi aplikasi + hash sumber yang menghasilkan indeks ini. Dipakai untuk
 *  menjawab \"fakta ini basi atau tidak\", bukan untuk pamer. */
/* Bentuk baris ini SENGAJA tetap tertutup - dua checker luar mencocokkannya
   dengan pola 'FAKTA_VERSI = { aplikasi: ..., hashSumber: ... }':
   scripts/cek-indeks-sinkron.mjs:65 dan scripts/uji-versi-indeks.mjs:111.
   Menambah field di baris yang sama membuat capnya TIDAK TERBACA, dan cap yang
   tidak terbaca sama saja dengan tidak ada cap. Angka berkas/entri yang juga
   dilaporkan --print-cakupan bisa diturunkan dari artefak yang sama:
   FAKTA_HASH_BERKAS.length (berkas) dan FAKTA_INDEKS.length (entri) di bawah. */
export const FAKTA_VERSI = { aplikasi: '${versiApp}', hashSumber: '${hashIndeks}' } as const;

/** Berkas (nama relatif, urut) yang isinya masuk hashSumber, plus resep
 *  hitungnya. Dengan ini cap bisa DIHITUNG ULANG dari luar generator - di mesin
 *  kerja, harness, atau saat repo terbuka - tanpa menyalin daftarnya tangan.
 *  Urutannya sama dengan urutan hashSumber() memasukkan isi tiap berkas;
 *  berkas yang HILANG ikut terdaftar dan dihitung sebagai '(tidak ada)'. */
export const FAKTA_HASH_BERKAS: readonly string[] = [
${daftarHash().map((p) => `  ${JSON.stringify(p)},`).join('\n')}
];
export const FAKTA_HASH_ALGO = 'sha1:hex[0:16] atas urutan (nama\\u0000 isi\\u0000); berkas hilang = "(tidak ada)"';
```

Terverifikasi di artefak: `FAKTA_HASH_BERKAS` terisi (daftar nama relatif) dan
`FAKTA_HASH_ALGO` ada; baris cap di `src/lib/zephyrIndeks.ts:35` sekarang berbunyi
`export const FAKTA_VERSI = { aplikasi: '1.1.13', hashSumber: '836ab9dd159dd737' } as const;`.

## 3. Patch 2 - `zephyrCari.ts`: pembanding murni

LAMA (verbatim, 250-252 + daftar impor):

```ts
import { FAKTA_INDEKS, FAKTA_KATEGORI, FAKTA_VERSI, type FaktaEntri, type FaktaKategori } from './zephyrIndeks';
export { FAKTA_KATEGORI, FAKTA_VERSI, type FaktaEntri, type FaktaKategori } from './zephyrIndeks';
…
export function versiFakta(): { aplikasi: string; hashSumber: string } {
  return { aplikasi: FAKTA_VERSI.aplikasi, hashSumber: FAKTA_VERSI.hashSumber };
}
```

BARU (ditambahkan; `FAKTA_HASH_BERKAS` ikut diimpor + di-ekspor ulang):

```ts
export function capTersimpan(): { aplikasi: string; hashSumber: string; berkas: number; entri: number } {
  return {
    aplikasi: FAKTA_VERSI.aplikasi,
    hashSumber: FAKTA_VERSI.hashSumber,
    berkas: FAKTA_HASH_BERKAS.length,
    entri: FAKTA_INDEKS.length,
  };
}

export function capBasi(capNyata: { aplikasi: string; hashSumber: string } | null): {
  basi: boolean; bisaDiverifikasi: boolean; alasan: string;
} {
  const cap = capTersimpan();
  if (capNyata === null) {
    return { basi: false, bisaDiverifikasi: false, alasan: `cap tersimpan ${cap.aplikasi} / ${cap.hashSumber}; pohon sumber tidak ada di sini, jadi kesegaran hash TIDAK bisa diverifikasi - jangan bilang "segar"` };
  }
  if (capNyata.hashSumber !== cap.hashSumber) {
    return { basi: true, bisaDiverifikasi: true, alasan: `hash sumber BEDA: tersimpan ${cap.hashSumber} vs nyata ${capNyata.hashSumber} - indeks dibuat dari sumber yang lebih lama` };
  }
  if (capNyata.aplikasi !== cap.aplikasi) {
    return { basi: true, bisaDiverifikasi: true, alasan: `versi BEDA: tersimpan ${cap.aplikasi} vs app ${capNyata.aplikasi} (hash sama, jadi hanya versi yang naik)` };
  }
  return { basi: false, bisaDiverifikasi: true, alasan: `segar: ${cap.aplikasi} / ${cap.hashSumber} sama dengan sumber sekarang` };
}
```

Vonis: **DITERAPKAN apa adanya**. Murni (tanpa I/O, tanpa tulis, tanpa jaringan) - sudah
dipanggil dari jalur app (bagian 4) tanpa menulis apa pun.

## 4. Patch 3 + 4 - `zephyrSelf.ts`

| Tempat | LAMA | BARU |
|---|---|---|
| `BAGIAN_TAMPAK` (49) | `['setelan', 'log', 'ekstensi', 'docs', 'versi']` | `[…, 'versi', 'indeks']` |
| baris kemutakhiran `bagianVersi` (418-424) | `(BASI - lebih tua dari app)` / `segar menurut VERSI (versi app == versi indeks) - hash sumber tidak bisa dihitung ulang dari dalam aplikasi, jadi kesegaran hash TIDAK terbukti di sini; itu diuji saat build oleh: node scripts/gen-fakta-zephyr.mjs --check (exit != 0 = BASI)` | + `- cap ${f.aplikasi} / ${f.hashSumber} (${cap.berkas} berkas, ${cap.entri} entri); cara memeriksa dari app: zephyr_self bagian=indeks` (dan `BASI menurut versi`) |
| fungsi baru `bagianIndeks` (≈431-480) | - | cap versi + hash + angka berkas/entri, versi app yang berjalan, hasil `capBasi(null)` apa adanya ("bisa diverifikasi: tidak"), dan 2 perintah pemeriksa yang bisa dijalankan di workspace |
| ringkasan `bagianSemua` (529-530) | `Indeks fakta: versi …, hash …[BASI - lebih tua dari app].` / `Rinciannya: bagian=setelan\|log\|ekstensi\|docs\|versi (plus fakta untuk indeks).` | `Indeks fakta: versi …, hash …, ${cap.berkas} berkas / ${cap.entri} entri…` / `…\|versi\|indeks (plus fakta untuk isi indeks).` |
| mesin basi (593) | `bagian === 'docs' \|\| 'fakta' \|\| 'semua'` | + `\|\| bagian === 'indeks'` |
| dispatch (619-622) | hanya `case 'versi'` | + `case 'indeks': isi = await bagianIndeks(); sumber = [...]` |
| deskripsi spec (549) + `enum` (555) | tanpa `indeks`, tanpa kontrak segarkan | `indeks (cap versi + hash sumber indeks fakta + angka berkas/entri, dan cara memeriksa kesegarannya)` + `enum: [..., 'indeks', ...]` + kalimat patch 4: "Kalau bagian=indeks melaporkan cap BEDA atau pemeriksa mengeluh BASI, tawarkan penyegaran lewat `suggest_command` dengan perintah `node scripts/gen-fakta-zephyr.mjs` (user yang menekan Enter), sebutkan angka yang tertinggal apa adanya, dan jangan mengaku fakta Zephyr sudah segar." |

Bukti pergeseran yang saya pakai untuk mengunci baris: `Periksa ZEPHYR SENDIRI` **0 kemunculan**
di `src/lib/zephyrIndeks.ts` → deskripsi tool tidak dipanen ke indeks, jadi menyuntingnya tidak
mengubah isi indeks (penting: tidak menambah entri, tidak menggeser digest).

## 5. Angka sebelum → sesudah

| Angka | Sebelum | Sesudah | Catatan |
|---|---|---|---|
| entri indeks | 6.254 | 6.254 | tidak ada entri baru (perubahan hanya cap/teks tool) |
| berkas peta kode | 429 | 429 | 0 berkas hilang/geser |
| hash sumber | `836ab9dd159dd737` | `836ab9dd159dd737` | refaktor 1a murni (sesuai prediksi dokumen) |
| cap tersimpan | `1.1.13 / 836ab9dd159dd737` | `1.1.13 / 836ab9dd159dd737` | versi app tidak naik |
| `zephyrIndeks.ts` | 1.065.952 byte | 1.074.859 byte | +8.907: daftar `FAKTA_HASH_BERKAS` (≈424 nama) + komentar; generator sendiri menghitung 1.060.345 (hitungan KARAKTER, berkas punya ~14,5k byte non-ASCII) |
| `zephyrFakta.ts` | 9.851 byte | 9.851 byte | tidak berubah |
| blok inti | 7950 char / 1988 token | 7950 char / 1988 token | ambang 2000 token; tak tersentuh |
| `uji-pengetahuan-angka` | 54/54 | 54/54 | F5/G4 tetap hijau |

Catatan drift (jujur): pada 13:39 indeks sempat BASI lagi karena LANE LAIN menyimpan
`src/lib/bacaKode.ts` (747 → 843 baris) dan `src/lib/commands.ts` (1.624 → 1.645 baris) - kedua
berkas itu memang sedang disunting di luar lane ini. Itu penyebab `uji-versi-indeks` sempat
`17/18` (kasus 12: "keluhan cek-indeks-sinkron 2") dan `cek-batas-inti` sempat exit 1; setelah
regenerasi ulang + seluruh bukti dijalankan dalam satu jendela 96 detik (13:43:05-13:44:41),
semuanya hijau. Jadi yang merah tadi adalah DRIFT, bukan produk - dan tidak ada kasus harness
yang saya lunakkan (`scripts/uji-versi-indeks.mjs` dan `scripts/uji-pengetahuan-angka.mjs`
tidak saya sentuh sama sekali).

## 6. Bukti wajib (keluaran apa adanya, satu jendela: 13:43:05-13:44:41)

```
$ node scripts/gen-fakta-zephyr.mjs --check
sinkron: zephyrFakta.ts 9843 byte + zephyrIndeks.ts 1060345 byte (6254 entri; bridge=1, dokumen=176, ekstensi=17, kode=429, label=3023, layar=1992, menu=122, panel=22, perintah=179, pintasan=66, port=4, seksi=31, setelan=124, tool=68).
CHECK_EXIT=0

$ node scripts/cek-indeks-sinkron.mjs
SINKRON - 0 keluhan
SINKRON_EXIT=0

$ node scripts/uji-versi-indeks.mjs
uji-versi-indeks: 18/18 lulus, 0 gagal, 0 dilewati - cap tersimpan 1.1.13 / 836ab9dd159dd737 vs cap nyata 1.1.13/836ab9dd159dd737; tertinggal 0 berkas peta kode dari 429 dan 0 entri
UJI_VERSI_EXIT=0

$ node scripts/cek-batas-inti.mjs
  OK    ukuran blok inti                   7950 char ~ 1988 token (ambang 8000 char ~ 2000 token)
  OK    inti menyebut zephyr_self          ya
  OK    zephyr_self dikirim selalu         ya (26 tool selalu dikirim)
  OK    kategori indeks terisi             6254 entri; ...
  OK    indeks sinkron dengan sumber       sinkron: zephyrFakta.ts 9843 byte + zephyrIndeks.ts 1060345 byte (6254 entri; ...)
  VERDICT: LULUS (1988 token <= 2000)
BATAS_EXIT=0

$ node scripts/uji-blok-inti.mjs
37/37 lulus
Ringkas: blok inti id 7984 char / 1996 tok, en 7925 char / 1982 tok (ambang 2000 tok).
BLOK_EXIT=0

$ node scripts/uji-pengetahuan-angka.mjs
  SKOR KEPATUHAN: 54/54 diperiksa
  VERDICT UJI PENGETAHUAN ANGKA: LULUS
PENGETAHUAN_EXIT=0

$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
TSC_EXIT=0 (0 baris keluaran)

$ node scripts/gen-fakta-zephyr.mjs --print-cakupan | head -c 110
{"versi":"1.1.13","hashSumber":"836ab9dd159dd737","jumlah":{"bridge":1,"dokumen":176,"ekstensi":17,"kode":429,
```

Detail kasus 12 (yang tadi sempat merah karena drift) sesudah regenerasi:

```
ok    12. jumlah berkas/entri tertinggal dilaporkan dengan ANGKA nyata
      - cap tersimpan 1.1.13 / 836ab9dd159dd737 vs cap nyata 1.1.13 / 836ab9dd159dd737; berkas sumber tanpa entri peta kode 0 dari 429, baris bergeser di 0 berkas, label tak terjangkau 0, entri 6.254 tersimpan vs 6.254 nyata (tertinggal 0: ), keluhan cek-indeks-sinkron 0; capSama=true -> wajib semua angka tertinggal 0 DAN keluhan 0 (segar=true)
```

## 7. Sisa + risiko yang saya catat apa adanya

1. **Indeks akan basi lagi setiap kali lane lain menyimpan berkas `src/**`** (terbukti: 13:30 →
   13:39). Cap/hash sekarang murni isi berkas, jadi ini perilaku yang DIINGINKAN - yang penting
   app tidak lagi mengaku "segar" tanpa bukti, dan pemeriksa menunjuk jalannya.
2. **App tidak bisa menghitung hash sendiri**: app terpasang tidak membawa pohon sumber, dan
   webview tidak punya sha1 (Web Crypto hanya sha-256). Karena itu bagian `indeks` bilang
   "bisa diverifikasi: tidak" dan menunjuk `cek-indeks-sinkron.mjs` / `--check` sebagai
   pemeriksa yang dijalankan di mesin yang punya sumbernya. Jika nanti mau cap diverifikasi
   dari dalam app, perlu hasher sha1 sendiri (bukan pekerjaan item ini).
3. **Penyegaran tetap perintah user** (`node scripts/gen-fakta-zephyr.mjs` lewat `suggest_command`);
   app tidak pernah menulis indeks diam-diam.
4. `docs/USULAN-VERSI-INDEKS.md` meminta bentuk `FAKTA_VERSI` yang diperluas - saya sengaja
   menyimpang (bagian 2b). Kalau pemilik dokumen ingin bentuk itu, kasus 1 harness WAJIB
   disepakati diubah lebih dulu (dilarang di item ini), atau angka `berkas`/`entri` tetap
   diturunkan dari `FAKTA_HASH_BERKAS.length` / `FAKTA_INDEKS.length` seperti sekarang.
5. Berkas saya tidak terlacak git (`??` di status) - jadi tidak ada diff git untuk laporan ini;
   teks LAMA/BARU di atas diambil dari catatan patch + pemulihan riwayat sesi, dan teks BARU
   dikutip langsung dari berkas di disk.
