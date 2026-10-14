# USULAN PATCH - cap hash sumber + jalur "indeks saya basi, mau saya segarkan?"

Item: ZEPH-VERSI-INDEKS-BASI (2026-10-14)
Berkas produk READ-ONLY. Semua perubahan di bawah adalah USULAN: berkas + nomor baris
+ teks LAMA / teks BARU, supaya bisa diterapkan satu per satu.

Nomor baris mengacu pada isi berkas **hari ini** (`feat/ai-panel-vscode-layout`, indeks
bundel `1.1.13 / f83cc022d0c620db`). Kalau ada suntingan lain lebih dulu, pakai teks LAMA
sebagai penambat - teksnya unik, bukan hanya nomornya.

> STATUS: usulan lengkap, BELUM diterapkan (kode produk read-only). Angka pendukungnya sudah
> dibuktikan: `node scripts/uji-versi-indeks.mjs` -> `18/18 lulus` (EXIT 0, tiga run), dan
> `npx tsc --noEmit` -> kode keluar 0 saat pencatatan. Catatan: di akhir pengerjaan pohon
> cabang disunting jalur lain sehingga tsc sekarang keluar 2 karena satu berkas belum selesai
> di sana (`src/lib/bacaKode.ts`, belum terlacak) - jadi sebelum menerapkan patch 2/3, tunggu
> pohon bersih supaya `npx tsc --noEmit` bisa dipakai memverifikasi hasilnya. Rincian:
> `docs/LAPORAN-VERSI-INDEKS.md` bagian 4 dan 5.

## 0. Masalahnya (satu paragraf, apa adanya)

Cap versi + hash sumber SUDAH ada di artefak (`src/lib/zephyrIndeks.ts:28`,
`FAKTA_VERSI = { aplikasi: '1.1.13', hashSumber: 'f83cc022d0c620db' }`) dan hashnya sudah
dihitung dari ISI sumber, bukan waktu/locale/mesin. Yang belum ada adalah **pemeriksanya di
dalam app**: `zephyrSelf.ts:404` dan `:540` menyimpulkan "BASI" hanya dari
`vApp !== vIndeks` - versi aplikasi vs versi indeks. Akibatnya hari ini app bilang
"segar (sama dengan versi app yang berjalan)" padahal hashnya sudah tertinggal
(`f83cc022d0c620db` vs `26e682bb085f4c80`, 36 entri, 20 berkas sumber tanpa entri peta kode -
lihat `cek-indeks-sinkron`: `BASI - 5 keluhan`, kode keluar 1). Versi tidak naik setiap kali
sumber berubah, jadi versi saja bukan penanda yang cukup: hash yang melihat perubahan isi.
Perbaikannya tiga lapis: (1) capnya harus bisa **dihitung ulang dari luar generator**, (2)
app harus punya **pembanding murni** untuk cap itu, (3) app harus bisa **bilang "basi"** dan
menawarkan satu perintah penyegaran - tanpa pernah menulis indeks diam-diam.

## 1. Ringkasan patch

| # | berkas:baris | sifat | risiko |
|---|---|---|---|
| 1a | `scripts/gen-fakta-zephyr.mjs:1193-1223` | refaktor murni: satu sumber urutan berkas hash (`daftarHash()`), digest TIDAK berubah | rendah - indeks wajib di-regenerate sekali (bukan di item ini) |
| 1b | `scripts/gen-fakta-zephyr.mjs:1408-1410` | tambah `FAKTA_HASH_BERKAS` + `FAKTA_HASH_ALGO`, tambah `berkas`/`entri` di `FAKTA_VERSI` | rendah - field tambahan, pembaca lama tetap jalan |
| 2 | `src/lib/zephyrCari.ts:250-252` | tambah `capBasi()` (murni, tanpa I/O) | rendah |
| 3 | `src/lib/zephyrTools/zephyrSelf.ts:49,51,404,494,500,539-540` | bagian baru `indeks` + `basi` memperhitungkan hash | sedang - mengubah teks yang dibaca model |
| 4 | `src/lib/zephyrTools/zephyrSelf.ts:494` | kontrak: saat BASI, tawarkan perintah segarkan lewat `suggest_command` | rendah - teks saja |

Patch 1a/1b **wajib lebih dulu**: 2 dan 3 mengandalkan cap yang bisa dihitung ulang dan daftar
berkas yang tidak disalin tangan.

## 2. Patch 1 - generator: cap bisa dihitung ulang dari luar

### 2a. Satu sumber urutan berkas hash

`scripts/gen-fakta-zephyr.mjs` - LAMA (baris 1193-1223, dua loop terpisah):

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
  /* Berkas permukaan IKUT, karena isi indeks sekarang bergantung padanya: label
     dan tombol dipanen dari JSX-nya. Tanpa ini, komponen yang tombolnya berubah
     tidak menggeser hash, dan `--check` bisa lolos dengan indeks yang sudah basi. */
  for (const p of berkasPermukaan()) {
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

BARU:

```js
/* DAFTAR TERTUTUP berkas yang masuk hash, urut, dalam satu tempat: hashSumber()
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

Urutan gabungannya sama seperti sebelumnya (`SUMBER_HASH` dulu, lalu `berkasPermukaan()`),
jadi digest-nya **tidak berubah** - dibuktikan dengan: setelah patch, `node scripts/gen-fakta-zephyr.mjs --print-cakupan`
harus tetap mencetak `hashSumber=26e682bb085f4c80`. Kalau berubah, urutannya salah.

### 2b. Cetak cap + daftarnya ke artefak

`scripts/gen-fakta-zephyr.mjs` - LAMA (baris 1408-1410, di dalam template hasil generate):

```js
/** Versi aplikasi + hash sumber yang menghasilkan indeks ini. Dipakai untuk
 *  menjawab \"fakta ini basi atau tidak\", bukan untuk pamer. */
export const FAKTA_VERSI = { aplikasi: '${versiApp}', hashSumber: '${hashIndeks}' } as const;
```

BARU:

```js
/** Versi aplikasi + hash sumber yang menghasilkan indeks ini. Dipakai untuk
 *  menjawab \"fakta ini basi atau tidak\", bukan untuk pamer. `berkas`/`entri`
 *  adalah angka yang sama dengan yang dilaporkan --print-cakupan, supaya
 *  pembanding di luar generator tidak perlu menebak. */
export const FAKTA_VERSI = { aplikasi: '${versiApp}', hashSumber: '${hashIndeks}', berkas: ${daftarHash().length}, entri: ${indeksEntri.length} } as const;

/** Berkas (nama relatif, urut) yang isinya masuk hashSumber, plus resep
 *  hitungnya. Dengan ini cap bisa DIHITUNG ULANG dari luar generator - di mesin
 *  kerja, harness, atau saat repo terbuka - tanpa menyalin daftarnya tangan. */
export const FAKTA_HASH_BERKAS: readonly string[] = [
${daftarHash().map((p) => `  ${JSON.stringify(p)},`).join('\n')}
];
export const FAKTA_HASH_ALGO = 'sha1:hex[0:16] atas urutan (nama\\u0000 isi\\u0000); berkas hilang = \"(tidak ada)\"';
```

Catatan: menambah field pada `FAKTA_VERSI` aman untuk pembaca yang ada - `versiFakta()`
(`zephyrCari.ts:250-252`) mengambil `aplikasi` dan `hashSumber` saja. Yang berubah: artefak
harus di-regenerate sekali supaya field barunya ada. **Item ini sengaja TIDAK meregenerate**
(D:/Zephyr dengan indeks basi adalah keadaan yang diperiksa, bukan yang diperbaiki).

## 3. Patch 2 - `zephyrCari.ts`: pembanding cap yang tidak menyentuh apa pun

LAMA (baris 250-252):

```ts
export function versiFakta(): { aplikasi: string; hashSumber: string } {
  return { aplikasi: FAKTA_VERSI.aplikasi, hashSumber: FAKTA_VERSI.hashSumber };
}
```

BARU (tambahan di bawahnya; `versiFakta()` tidak diubah supaya pemanggil lama tetap aman):

```ts
/** Cap yang tercatat di artefak (tanpa I/O): versi app + hash sumber + angka
 *  yang dilaporkan generator saat indeks ini dibuat. */
export function capTersimpan(): { aplikasi: string; hashSumber: string; berkas: number; entri: number } {
  return {
    aplikasi: FAKTA_VERSI.aplikasi,
    hashSumber: FAKTA_VERSI.hashSumber,
    berkas: FAKTA_VERSI.berkas,
    entri: FAKTA_VERSI.entri,
  };
}

/**
 * Bandingkan cap tersimpan dengan cap NYATA. Murni: tidak membaca berkas, tidak
 * menulis apa pun, tidak menyentuh jaringan - jadi aman dipanggil berkali-kali.
 *
 * `capNyata` = cap yang dihitung dari pohon sumber SEKARANG (mis. keluaran
 * `gen-fakta-zephyr.mjs --print-cakupan`, atau hitungan ulang dari
 * `FAKTA_HASH_BERKAS` saat repo terbuka). `null` = pohon sumber tidak ada di sini
 * (aplikasi terpasang): JANGAN mengaku segar - katakan tidak bisa diverifikasi.
 */
export function capBasi(capNyata: { aplikasi: string; hashSumber: string } | null): {
  basi: boolean;
  bisaDiverifikasi: boolean;
  alasan: string;
} {
  const cap = capTersimpan();
  if (capNyata === null) {
    return {
      basi: false,
      bisaDiverifikasi: false,
      alasan: `cap tersimpan ${cap.aplikasi} / ${cap.hashSumber}; pohon sumber tidak ada di sini, jadi kesegaran hash TIDAK bisa diverifikasi - jangan bilang "segar"`,
    };
  }
  if (capNyata.hashSumber !== cap.hashSumber) {
    return {
      basi: true,
      bisaDiverifikasi: true,
      alasan: `hash sumber BEDA: tersimpan ${cap.hashSumber} vs nyata ${capNyata.hashSumber} - indeks dibuat dari sumber yang lebih lama`,
    };
  }
  if (capNyata.aplikasi !== cap.aplikasi) {
    return {
      basi: true,
      bisaDiverifikasi: true,
      alasan: `versi BEDA: tersimpan ${cap.aplikasi} vs app ${capNyata.aplikasi} (hash sama, jadi hanya versi yang naik)`,
    };
  }
  return { basi: false, bisaDiverifikasi: true, alasan: `segar: ${cap.aplikasi} / ${cap.hashSumber} sama dengan sumber sekarang` };
}
```

`capTersimpan()` membaca `FAKTA_VERSI.berkas`/`.entri` - **butuh patch 1b lebih dulu**
(kalau belum diterapkan, ganti dua baris itu jadi `berkas: FAKTA_HASH_BERKAS.length,
entri: FAKTA_INDEKS.length`, keduanya sudah ada di artefak hari ini).

## 4. Patch 3 - `zephyrSelf.ts`: bagian `indeks`, dan `basi` yang melihat hash

### 4a. Daftar bagian (baris 49-51)

LAMA:

```ts
export const BAGIAN_TAMPAK: readonly string[] = ['setelan', 'log', 'ekstensi', 'docs', 'versi'];
...
export const BAGIAN_LAIN: readonly string[] = ['fakta', 'semua'];
```

BARU:

```ts
export const BAGIAN_TAMPAK: readonly string[] = ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'indeks'];
...
export const BAGIAN_LAIN: readonly string[] = ['fakta', 'semua'];
```

### 4b. `bagianVersi()` - satu baris hash (baris 410-411)

LAMA:

```ts
  baris.push(`Indeks fakta bundel: versi ${f.aplikasi} - hash sumber ${f.hashSumber}`);
  baris.push(`Kemutakhiran indeks: ${basi ? `BASI - indeks dibuat untuk versi ${f.aplikasi}, aplikasi berjalan ${vApp}` : 'segar (sama dengan versi app yang berjalan)'}`);
```

BARU:

```ts
  baris.push(`Indeks fakta bundel: versi ${f.aplikasi} - hash sumber ${f.hashSumber}`);
  /* Versi saja tidak cukup: sumber bisa berubah tanpa versi naik. Sebutkan hash
     apa adanya, dan jangan mengaku "segar" dari data yang tidak bisa diperiksa. */
  baris.push(`Kemutakhiran indeks (versi): ${basi ? `BASI - indeks dibuat untuk versi ${f.aplikasi}, aplikasi berjalan ${vApp}` : 'versi cocok (sama dengan versi app yang berjalan)'}`);
  baris.push(`Kemutakhiran indeks (hash): hash ${f.hashSumber} TIDAK bisa dihitung ulang dari sini (aplikasi terpasang tidak membawa pohon sumber) - pakai bagian=indeks untuk cara memeriksanya`);
```

### 4c. Perhitungan `basi` (baris 537-540)

LAMA:

```ts
  // BASI hanya bisa terjadi pada data yang IKUT BUNDEL (indeks fakta/dokumen);
  // setelan/log/ekstensi/versi dibaca hidup dari app saat itu juga.
  const pakaiIndeks = bagian === 'docs' || bagian === 'fakta' || bagian === 'semua';
  const basi = pakaiIndeks && vApp !== '?' && vIndeks !== '?' && vApp !== vIndeks;
```

BARU:

```ts
  // BASI hanya bisa terjadi pada data yang IKUT BUNDEL (indeks fakta/dokumen);
  // setelan/log/ekstensi/versi dibaca hidup dari app saat itu juga.
  const pakaiIndeks = bagian === 'docs' || bagian === 'fakta' || bagian === 'semua' || bagian === 'indeks';
  const basi = pakaiIndeks && vApp !== '?' && vIndeks !== '?' && vApp !== vIndeks;
```

Catatan penerapan: `bagian === 'indeks'` ikut masuk `pakaiIndeks` supaya kepala "PERINGATAN -
data di bawah ini BASI" juga terpasang saat versinya memang berbeda. Jangan menambah variabel
baru di sini kalau tidak dipakai - `noUnusedLocals` akan menolaknya; cap dibaca di
`bagianIndeks()` (4d) yang memang memakainya.

### 4d. Bagian baru `indeks` (fungsi, ditaruh setelah `bagianVersi()`, sekitar baris 416)

```ts
/* ------------------------------------------------------------------ */
/* bagian=indeks                                                       */
/* ------------------------------------------------------------------ */

/**
 * Cap indeks bundel + jalur perbaikannya. TIDAK menulis apa pun: yang dijalankan
 * hanya alat pemeriksa, dan penyegaran tetap perintah yang di-Enter user.
 *
 * Kenapa tidak dihitung sendiri: aplikasi terpasang tidak membawa pohon sumber,
 * jadi hash sumber tidak bisa dihitung dari dalam app. Yang bisa dilakukan app
 * adalah (a) menyebut capnya, (b) menjalankan pemeriksa saat repo terbuka, dan
 * (c) bilang apa adanya saat tidak bisa diverifikasi. Menghitung ulang hash
 * hanya mungkin kalau `FAKTA_HASH_BERKAS` + pohon sumbernya ada - dan itu
 * keadaan mesin kerja, bukan keadaan user.
 */
async function bagianIndeks(): Promise<string> {
  const cari = await import('../zephyrCari');
  const cmd = await import('../commands');
  const { useStore } = await import('../store');
  const cap = cari.capTersimpan();
  const ai = (await cmd.getAppInfo().catch(() => null)) as { version?: string } | null;
  const vApp = ai?.version ?? (await cmd.getDiagnostics().catch(() => null) as { version?: string } | null)?.version ?? '?';
  const ws = useStore.getState().workspace;
  const baris = [
    `Cap indeks bundel: versi ${cap.aplikasi} - hash sumber ${cap.hashSumber} - ${cap.berkas} berkas - ${cap.entri} entri.`,
    `Versi aplikasi yang berjalan: ${vApp}${vApp !== '?' && vApp !== cap.aplikasi ? ' (BEDA - indeks dibuat untuk versi lain)' : vApp === '?' ? ' (tidak terbaca)' : ' (sama)'}.`,
    'Kesegaran hash TIDAK bisa dihitung dari dalam app: aplikasi terpasang tidak membawa pohon sumbernya. Yang bisa: jalankan pemeriksa di mesin yang punya sumbernya.',
  ];
  if (ws) {
    baris.push(`Workspace terbuka: ${ws}. Kalau folder itu pohon sumber Zephyr, jalankan di terminal pane:`);
    baris.push('  node scripts/cek-indeks-sinkron.mjs');
    baris.push('  node scripts/gen-fakta-zephyr.mjs --check');
    baris.push('Pemeriksa mencetak cap tersimpan vs cap nyata + jumlah berkas/entri yang tertinggal; `--check` keluar 1 saat basi. Jangan menyegarkan tanpa perintah user.');
  } else {
    baris.push('Tidak ada workspace terbuka, jadi tidak ada tempat menjalankan pemeriksa. Sebutkan cap di atas apa adanya.');
  }
  return baris.join('\n');
}
```

Pendaftarannya di `switch` (baris 561-564, setelah `case 'versi'`):

LAMA:

```ts
    case 'versi':
      isi = await bagianVersi();
      sumber = ['get_app_info', 'get_diagnostics', 'updaterStore', 'mcp_status', 'zephyrCari.versiFakta'];
      break;
```

BARU:

```ts
    case 'versi':
      isi = await bagianVersi();
      sumber = ['get_app_info', 'get_diagnostics', 'updaterStore', 'mcp_status', 'zephyrCari.versiFakta'];
      break;
    case 'indeks':
      isi = await bagianIndeks();
      sumber = ['zephyrCari.capTersimpan', 'get_app_info', 'get_diagnostics', 'store.workspace', 'scripts/cek-indeks-sinkron.mjs'];
      break;
```

### 4e. Enumerasi + deskripsi tool (baris 494-508)

LAMA:

```ts
    'Periksa ZEPHYR SENDIRI dari sumber milik aplikasi - tidak butuh folder proyek user dan tidak butuh jaringan. bagian: setelan (settings.json + nilai efektif), log (berkas log, kebijakan rotasi, status panic), ekstensi (terdaftar/mati/gagal + alasan), docs (dokumen bundel + pencarian lokal), versi (versi app, status update, port MCP), fakta (indeks fakta Zephyr: label, setelan, perintah, pintasan, tool, ekstensi, dokumen), semua (ringkasan). kueri = pencarian lokal deterministik; maks = jumlah potongan (1-4, <=800 token/potongan).',
```

BARU (sisipkan `indeks`):

```ts
    'Periksa ZEPHYR SENDIRI dari sumber milik aplikasi - tidak butuh folder proyek user dan tidak butuh jaringan. bagian: setelan (settings.json + nilai efektif), log (berkas log, kebijakan rotasi, status panic), ekstensi (terdaftar/mati/gagal + alasan), docs (dokumen bundel + pencarian lokal), versi (versi app, status update, port MCP), indeks (cap versi + hash sumber indeks fakta, dan cara memeriksa kesegarannya), fakta (indeks fakta Zephyr: label, setelan, perintah, pintasan, tool, ekstensi, dokumen), semua (ringkasan). kueri = pencarian lokal deterministik; maks = jumlah potongan (1-4, <=800 token/potongan).',
```

dan `enum` bagian (baris 500):

LAMA:

```ts
        enum: ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'fakta', 'semua'],
```

BARU:

```ts
        enum: ['setelan', 'log', 'ekstensi', 'docs', 'versi', 'indeks', 'fakta', 'semua'],
```

## 5. Patch 4 - jalur "indeks saya basi, mau saya segarkan?"

Zeph tidak punya tool untuk menjalankan shell sendiri (katalog tool hanya punya
`suggest_command`, `catalog.ts:153` - "user yang menjalankannya"). Itu justru bentuk yang
benar untuk penyegaran indeks: menulis ulang artefak bundel bukan hal yang boleh dilakukan
model diam-diam. Jadi usulannya teks kontrak, bukan kode baru.

`scripts/gen-fakta-zephyr.mjs` `SPEC_ZEPHYR_SELF.description` - tambahkan satu kalimat
(gabung dengan patch 4e), BARU:

```ts
    '... maks = jumlah potongan (1-4, <=800 token/potongan). Kalau bagian=indeks melaporkan cap BEDA atau pemeriksa mengeluh BASI, tawarkan penyegaran lewat suggest_command dengan perintah `node scripts/gen-fakta-zephyr.mjs` (user yang menekan Enter), sebutkan angka yang tertinggal apa adanya, dan jangan mengaku fakta Zephyr sudah segar.',
```

Alur yang diusulkan (semua langkah sudah ada di app, tidak ada yang baru):
1. `zephyr_self { bagian: 'indeks' }` -> cap tersimpan + perintah pemeriksa;
2. pemeriksa di terminal pane -> angka nyata + `--check` keluar 1;
3. model mengutip angkanya dan `suggest_command` dengan `node scripts/gen-fakta-zephyr.mjs`;
4. setelah user menjalankannya, indeks baru membawa cap baru, dan `zephyr_self` kembali
   melaporkan versi yang cocok - lingkaran tertutup tanpa jalur tulis tersembunyi.

## 6. Urutan penerapan & risiko

1. **Patch 1a** (generator, satu sumber daftar hash) - buktikan digest tidak berubah:
   `node scripts/gen-fakta-zephyr.mjs --print-cakupan` masih `hashSumber=26e682bb085f4c80`.
2. **Patch 1b** (cetak `FAKTA_HASH_BERKAS` + angka di `FAKTA_VERSI`) - lalu regenerate indeks
   (`node scripts/gen-fakta-zephyr.mjs`) **atas perintah user**, bukan di item ini. Setelah
   regenerate, `cek-indeks-sinkron` harus kembali hijau (0 keluhan) dan hash tersimpan = hash
   nyata; kalau tidak, ada suntingan yang belum ter-generate.
3. **Patch 2** (`capBasi`) - murni, bisa diuji tanpa app: tambah 3 kasus di
   `scripts/uji-versi-indeks.mjs` (`capNyata=null` -> `bisaDiverifikasi=false`; hash beda ->
   `basi=true`; cap sama -> `basi=false`).
4. **Patch 3** (bagian `indeks`) - **BUTUH APP**: perilakunya hanya terbukti di app yang
   berjalan (`verify*.mjs` lewat CDP: panggil `zephyr_self` bagian `indeks` dan cocokkan teks
   capnya dengan `--print-cakupan`). Model yang membaca teks ini juga berubah, jadi jalankan
   ulang verifikasi pemahaman Zeph sendiri (`scripts/uji-tahu-zephyr.mjs`).
5. **Patch 4** (kontrak saran) - **BUTUH APP**: buktikan dengan satu giliran AI panel bahwa
   `suggest_command` benar-benar muncul saat cap BEDA, bukan sekadar di teks spec.

Risiko yang jujur:

- `FAKTA_HASH_BERKAS` menambah artefak (≈424 nama berkas). Itu sengaja: tanpa daftar itu cap
  tidak bisa dihitung ulang, dan cap yang tidak bisa dihitung ulang tidak mendeteksi apa pun.
  Kalau ukurannya mengganggu, daftarnya bisa dimuat lewat `--print-hash` saja (bukan di bundel)
  - dengan konsekuensi hanya mesin kerja yang bisa memeriksa.
- Teks `Kemutakhiran indeks (versi): ... versi cocok ...` sengaja TIDAK lagi berbunyi "segar",
  karena versi cocok bukan berarti isi cocok. Ini mengubah jawaban model untuk pertanyaan
  "fakta Zephyr ini masih berlaku?" - lebih jujur, tapi lebih hati-hati.
- Hash lebih sempit daripada `--check`: kasus 7 harness menunjukkan berkas uji
  (`src/lib/zz-lab.test.tsx`) TIDAK masuk hash tapi MASUK peta kode. Jadi `--check` (dan
  `cek-indeks-sinkron`) tetap pemeriksa utama; cap hash adalah penanda cepat dan murah.

## 7. Yang sengaja TIDAK diusulkan

- Tidak ada jalur tulis otomatis: app model tidak boleh meregenerate indeks sendiri tanpa
  user menekan Enter - artefak bundel adalah keluaran build, bukan keadaan runtime.
- Tidak ada cap berbasis waktu: `FAKTA_VERSI` tidak mendapat field `dibuat`/tanggal. Cap yang
  memuat jam bukan cap isi, dan harness (kasus 4/5) membuktikan capnya harus byte-identik
  antar pemanggilan.
- Tidak ada perubahan pada `src/lib/zephyrIndeks.ts`/`zephyrFakta.ts` sebagai berkas: keduanya
  hasil generate, dan disunting tangan akan langsung ditimpa regenerate berikutnya.
- Tidak menyentuh `.env`/kunci API: tidak ada patch di atas yang membaca atau menulisnya
  (harness kasus 14 memeriksa itu, dengan kontrol positif).
