# USULAN-KONTEKS-REPO-CELAH — hasil uji adversarial `src/lib/konteksRepo.ts`

Dokumen ini ditulis oleh lane **ZEPH-KONTEKS-REPO (uji adversarial)**, bukan oleh pemilik modul.
**Tidak ada satu pun berkas lane lain yang diubah.** Yang dilahirkan lane ini hanya dua berkas baru:

| berkas | isi |
| --- | --- |
| `scripts/uji-konteks-repo-adv.mjs` | harness adversarial, 57 kasus, node-only |
| `docs/USULAN-KONTEKS-REPO-CELAH.md` | dokumen ini (temuan + usulan tambalan persis) |

`src/lib/konteksRepo.ts`, `scripts/cek-konteks-repo.mjs`, dan `docs/KONTEKS-REPO.md` **tidak disentuh**
(milik lane lain; gate lamanya tetap hijau seperti semula — lihat §2).

---

## 1. Cara menjalankan

```bash
cd D:/Zephyr
node scripts/cek-konteks-repo.mjs                 # gate lama (resmi)
node scripts/uji-konteks-repo-adv.mjs             # uji adversarial, mode KETAT (celah = GAGAL, exit 1)
node scripts/uji-konteks-repo-adv.mjs --celah-diketahui   # celah dilaporkan, exit 0 kalau tidak ada regresi
npx tsc --noEmit
```

Harness adversarial membundel **satu entri saja** (`src/lib/konteksRepo.ts`, yang ikut menarik `./agentGuard`)
lewat esbuild ke folder sementara **di luar repo** (`$TMPDIR/uji-konteks-repo-adv-*`) dan menghapusnya di akhir.
Modul diuji apa adanya — tidak ada salinan logika di dalam harness. Tidak ada berkas repo yang ditulis/dihapus.

Mode ketat sengaja exit `!= 0` selama celah §4 masih terbuka: skrip ini tidak menambal modul orang lain, dan
tidak membisukan temuan. Kalau lane pemilik menambal, jalankan ulang mode ketat sampai `== 57/57 lulus ==` + exit 0.

---

## 2. Hasil nyata (bukan klaim)

| uji | hasil | exit |
| --- | --- | --- |
| `node scripts/cek-konteks-repo.mjs` (gate lama, dijalankan ulang lane ini) | `HASIL: 43 lulus, 0 gagal` | 0 |
| `node scripts/uji-konteks-repo-adv.mjs --celah-diketahui` | `== 43/57 lulus ==`, 14 celah dikenal, **0 gagal tak terduga** | 0 |
| `node scripts/uji-konteks-repo-adv.mjs` (ketat) | `== 43/57 lulus ==`, 14 celah dihitung GAGAL | 1 |
| `npx tsc --noEmit` | tanpa keluaran | 0 (0 galat) |

Kasus: **57** (butuh minimal 12). Lulus **43**, celah nyata **14** (semuanya di §4), gagal tak terduga **0**.

Angka modul yang diukur harness (diekspor modul, bukan diserahkan ke model):

```
BATAS_PINDAI_BERKAS   = 5.000     BATAS_UKURAN_BERKAS = 1.048.576 B
BATAS_BERKAS_TAMPIL   = 300       BATAS_CHAR_RINGKASAN = 6.000 char
BATAS_BYTE_TAMPIL     = 8.388.608 POLA_RAHASIA_EFEKTIF = 27 pola
ABAIKAN_SEGMEN        = 35 segmen bundle konteksRepo.ts+agentGuard = 26.192 byte
```

Envelope nyata yang terukur (`bangunKonteksRepo`, semua deterministik):

| skenario | keluaran |
| --- | --- |
| 20.000 berkas buatan | `dipindai=5.000`, `tampil=300`, `terpotongPindai/Jumlah/Char=true`, ringkasan 6.000 char |
| 20 berkas @700 KB | `byteTampil=7.884.800` ≤ 8.388.608, `tampil=11/20`, `terpotongByte=true` |
| 150 `.ts` + 150 `.png` @900 KB | `byteTampil=8.354.400`, `.ts` tampil **150/150**, `.png` tampil 9, `terpotongByte=true` |
| 400 berkas kecil | ringkasan **6.027** char ← melebihi batas 6.000 (celah C-4) |
| repo kosong (`akar: ''`) | ringkasan 518 char, `tampil=0`, `'none survived'`, akar `(unknown)` |
| determinisme | `JSON.stringify(konteks)` 34.549 byte, dua jalankan **identik** |

---

## 3. Tabel kasus (57)

| bagian | kasus | lulus | celah |
| --- | --- | --- | --- |
| A. rahasia diminta eksplisit tapi tidak muncul | A1–A7 | 7 | 0 |
| B. jalur melar keluar akar | B1–B12 | 1 (B10) | 11 (B1–B9, B11, B12) |
| C. biner / non-utf8 / injeksi format | C1–C6 | 5 | 1 (C2) |
| D. anggaran + laporan pemotongan | D1–D7 | 5 | 2 (D2, D5) |
| E. repo kosong / masukan rusak | E1–E7 | 7 | 0 |
| F. nama berkas aneh | F1–F3 | 3 | 0 |
| G. `.gitignore` negasi + folder | G1–G6 | 6 | 0 |
| H. bukti tanpa jaringan | H1–H5 | 5 | 0 |
| I. keluaran bebas nilai rahasia | I1–I4 | 4 | 0 |

**Tidak lulus, tapi bukan celah** — semuanya dipin sebagai perilaku yang disadari/dokumentasikan: A7
(`.env.example` ikut tersembunyi), G3 (negasi menembus folder yang diabaikan — permisif), G4 (brace
`{a,b}` tidak didukung, sama seperti git), I4 (nama berkas yang menyerupai token ikut tercetak — hanya nama).

---

## 4. Celah nyata + usulan tambalan persis

Semua penambalan di bawah **belum dikerjakan** (berkas bukan milik lane ini). Setelah menerapkan, ulangi
`node scripts/uji-konteks-repo-adv.mjs` (ketat) — kasus yang disebut di tiap celah harus berubah jadi `ok`,
dan A1–A7/B10/H3/I1–I4 **tidak boleh** ikut gugur.

### C-1 — TINGGI: jalur melar keluar akar diterima apa adanya (B1–B9, B12)

**Bukti:** `../rahasia.ts`, `..\rahasia.ts`, `a/../../b.ts`, `./../x.ts`, `..`, `C:/Windows/win.ini`,
`D:/Luar/berkas.ts`, `\\server\share\x.ts` semuanya **lulus** `alasanBlokirRahasia()` → `null` dan masuk daftar
(`tampil="../rahasia.ts"` dst.). Bukan cuma tampil: di `pindaiKonteksRepo()` jalur itu sampai dikirim ke
jembatan disk — kasus B12 merekam `3` panggilan `fsStat`, **2 di antaranya resolve ke luar akar**
(`D:/RepoSaya/../luar-rahasia/bocor.ts`, `C:/Windows/win.ini`).

**Akar masalah (dibaca langsung, bukan dugaan):**

* `normalJalur()` (`src/lib/konteksRepo.ts:526-533`) hanya merapikan pemisah dan membuang `./` — **tidak**
  menolak `..`, dan `.replace(/^\/+/, '')` bahkan **membuang akar absolut** sehingga `C:/Windows/win.ini`
  menjadi bentuk relatif yang tampak sah.
* `alasanBlokirRahasia()` (`:602-620`) tidak punya pemeriksaan traversal sama sekali.
* Gerbang yang dipanggilnya, `periksaBaca()` (`src/lib/agentGuard.ts:180-211`), hanya memeriksa byte kontrol,
  `POLA_RAHASIA`, dan `DIR_TERPROTEKSI` — **tidak ada** pemeriksaan `..`/jalur absolut. (`diDalamTerproteksi`
  di `:171-173` juga pencocokan substring, bukan per segmen.)

**Usulan tambalan** — `src/lib/konteksRepo.ts`, sisipkan setelah baris 604 (`if (!p) return 'jalur-terlarang';`):

```diff
--- a/src/lib/konteksRepo.ts
+++ b/src/lib/konteksRepo.ts
@@ -602,6 +602,18 @@ export function alasanBlokirRahasia(rel: string, akar = ''): JenisBlokir | null {
   const p = normalJalur(rel);
   if (!p) return 'jalur-terlarang';
 
+  // Jalur yang naik keluar akar (dan jalur absolut) tidak boleh lolos. Diperiksa
+  // pada bentuk MENTAH: normalJalur() sudah membuang akar absolut dan merapikan
+  // pemisah, jadi jejaknya hilang setelah normalisasi.
+  const mentah = String(rel ?? '');
+  if (mentah.startsWith('\\\\') || mentah.startsWith('//')) return 'jalur-terlarang'; // UNC / berbagi
+  if (
+    /^[A-Za-z]:/.test(p) ||
+    p.startsWith('/') ||
+    p === '..' ||
+    p.startsWith('../') ||
+    p.split('/').includes('..')
+  ) {
+    return 'jalur-terlarang';
+  }
+  // Pemisah ter-encode: kalau pemanggil (sisi Rust) men-decode, ini jadi traversal.
+  if (/%2e|%2f|%5c/i.test(p)) return 'jalur-terlarang';
+
   const nama = basename(p);
```

Catatan: bentuk `%2e%2e/naik.ts` (B6) **tidak** didekode modul ini, jadi resikonya bergantung pada sisi Rust —
karena itu usulannya gagal-tertutup. Kalau lane pemilik lebih suka satu titik pemeriksaan, tambalan yang setara
bisa diletakkan di `agentGuard.periksaBaca()` — tapi itu menyentuh gerbang semua agent, jadi lane ini
merekomendasikan tambalan lokal di `alasanBlokirRahasia()`.

### C-2 — SEDANG: folder repo bernama `etc/`, `sys/`, `proc/`, `var/db/` ikut disembunyikan (B11)

**Bukti:** `etc/service.ts`, `sys/kernel.ts`, `proc/reader.ts`, `var/db/x.ts`, `docs/etc/panduan.md` →
`tampil=0/5`, semuanya `{"rahasia-folder":5}`. Berkas repo pengguna yang sah lenyap dari konteks hanya karena
namanya folder. (B10 `/etc/hosts` "ditolak" juga **bukan** karena aturan akar, tapi karena segmen `etc` —
salah-alasan-yang-benar, dan itu tandanya cacat yang sama.)

**Akar masalah:** `DIR_TERPROTEKSI` (`agentGuard.ts:115-141`) berisi folder **sistem absolut**: `/etc`,
`/private/etc`, `/proc`, `/sys`, `/var/db`, `/var/root`, `/library/*`, `/appdata/*`. Baris `konteksRepo.ts:611-617`
mengujinya dengan `${cmp}/`.includes(`${dir}/`) terhadap `[absolut, p]` — jadi jalur **relatif di dalam repo**
ikut diuji ke daftar folder sistem. Baris 619 menambah jalur yang sama lewat `periksaBaca(absolut)`.

**Usulan tambalan** — `src/lib/konteksRepo.ts:611-619`:

```diff
@@ -611,9 +611,20 @@ export function alasanBlokirRahasia(rel: string, akar = ''): JenisBlokir | null {
-  const absolut = akar ? `${normalJalur(akar)}/${p}` : p;
-  for (const calon of absolut === p ? [p] : [absolut, p]) {
-    const cmp = bentukBanding(calon);
-    for (const dir of DIR_TERPROTEKSI) {
-      if (`${cmp}/`.includes(`${dir}/`)) return 'rahasia-folder';
-    }
-  }
+  // DIR_TERPROTEKSI mengawal folder SISTEM pada jalur absolut. Menguji jalur
+  // relatif terhadapnya (versi lama) menelan folder repo biasa: `etc/`, `proc/`,
+  // `sys/`, `var/db/`, bahkan `docs/etc/`. Untuk jalur relatif, yang tetap
+  // berlaku hanya folder ber-titik (/.ssh, /.gnupg, /.aws, /.git, ...).
+  const relCmp = bentukBanding(p);
+  const cmpAkar = akar ? bentukBanding(normalJalur(akar)) : '';
+  for (const dir of DIR_TERPROTEKSI) {
+    const d = bentukBanding(dir);
+    if (!d) continue;
+    if (d.includes('/.')) {
+      if (`/${relCmp}/`.includes(`${d}/`)) return 'rahasia-folder';
+    } else if (cmpAkar && (cmpAkar === d || cmpAkar.startsWith(`${d}/`))) {
+      // akar repo sendiri berada di folder sistem -> semua isinya terproteksi
+      return 'rahasia-folder';
+    }
+  }
 
-  if (!periksaBaca(p).ok || !periksaBaca(absolut).ok) return 'jalur-terlarang';
+  // `periksaBaca(absolut)` dibuang: diDalamTerproteksi() mencocokkan substring,
+  // jadi akar+rel selalu bisa kena folder sistem. Akar sudah diperiksa di atas.
+  if (!periksaBaca(p).ok) return 'jalur-terlarang';
   return null;
 }
```

Setelah tambalan ini, `/.gnupg/pubring.kbx` harus **tetap** `rahasia-folder` (dipakai A4) dan
`.env`/`id_rsa`/`*.pem` tetap `rahasia-nama` (A1–A5).

### C-3 — SEDANG: laporan pemotongan ikut terpotong, jadi tidak terbaca model (D2)

**Bukti:** pada 20.000 berkas, `tampil=300`, `terpotongPindai/Jumlah=true`, `terpotongChar=true` — tapi teks
yang dibaca model **tidak memuat** `at most 300 files are listed` maupun `first 5.000 entries`. Penyebabnya
urutan: baris `- Truncated: …` (`:1000-1004`) dan catatan rahasia (`:1006-1010`) ditulis **setelah** daftar
300 berkas (`:991-998`), lalu pemotongan karakter `:1014-1018` memakan ekornya. Jadi model melihat 300 berkas
tanpa tahu ada 4.700 lagi yang tidak diperiksa — "jangan diam-diam memotong" tidak terpenuhi untuk pembaca teks.
(Stat tetap jujur sebagai data; yang hilang laporannya.)

**Usulan tambalan** — pindahkan blok `potong` (baris 1000-1004) + catatan rahasia (1006-1010) ke **atas** baris 991:

```diff
@@ -989,6 +989,20 @@
   }
 
+  const potong: string[] = [];
+  if (s.terpotongJumlah) potong.push(`at most ${BATAS_BERKAS_TAMPIL} files are listed`);
+  if (s.terpotongByte) potong.push(`the listed corpus is capped at ${ringkasByte(BATAS_BYTE_TAMPIL)}`);
+  if (s.terpotongPindai) potong.push(`only the first ${BATAS_PINDAI_BERKAS} entries were examined`);
+  if (potong.length) baris.push(`- Truncated: ${potong.join('; ')}.`);
+
+  baris.push(
+    '- Secret material (environment files, private keys, credential stores, and the',
+    '  protected dot-folders) is NEVER listed and never read: if a path is missing from',
+    '  this list, do not guess at it and do not ask the user to paste it in.',
+  );
+
   if (k.berkas.length) {
     baris.push(`- Files (path | language | size | last modified) - ${k.berkas.length} of ${s.tampil}:`);
@@ -1000,11 +1014,0 @@ (blok lama dihapus dari sini)
-  const potong: string[] = [];
-  ...
-  if (potong.length) baris.push(`- Truncated: ${potong.join('; ')}.`);
-
-  baris.push(
-    '- Secret material (environment files, ...',
-  );
```

### C-4 — RENDAH: `BATAS_CHAR_RINGKASAN` dilampaui 27 char oleh penanda potong (D5)

**Bukti:** ringkasan terpanjang terukur **6.027** char padahal `BATAS_CHAR_RINGKASAN = 6.000`. Di baris
`:1014-1018` teks dipotong ke 6.000 lalu **penanda** `\n… (summary cut at 6000 characters)` ditambahkan
sesudahnya → total melebihi batas yang modul janjikan sendiri (dan anggaran token yang dihitung dari
konstanta itu jadi sedikit meleset).

**Usulan tambalan** — `src/lib/konteksRepo.ts:1014-1018`:

```diff
@@ -1014,6 +1014,7 @@
   if (teks.length > BATAS_CHAR_RINGKASAN) {
-    teks = teks.slice(0, BATAS_CHAR_RINGKASAN);
+    const penanda = `\n… (summary cut at ${BATAS_CHAR_RINGKASAN} characters)`;
+    teks = teks.slice(0, BATAS_CHAR_RINGKASAN - penanda.length);
     const barisTerakhir = teks.lastIndexOf('\n');
     if (barisTerakhir > 0) teks = teks.slice(0, barisTerakhir);
-    teks += `\n… (summary cut at ${BATAS_CHAR_RINGKASAN} characters)`;
+    teks += penanda;
     terpotong = true;
   }
```

### C-5 — RENDAH: berkas biner memakai slot daftar + anggaran byte (C2)

**Bukti:** 6 biner (`logo.png`, `app.exe`, `a.dll`, `x.bin`, `arsip.zip`, `tut.mp4`) semuanya masuk daftar
dengan label bahasa (`Gambar`, `Biner`, `Arsip`, `Lainnya (.bin)`, `Video`). Pada kasus 150 `.ts` + 150 `.png`
@900 KB, 9 baris `.png` memakan **8.100.000** dari 8.388.608 byte anggaran (97%). Kode kecil tetap kebagian
karena `terpotongByte` memakai `continue` (bukan `break`) — itu bagus — tapi daftar dan `- Languages` (dihitung
dari `kandidat`) jadi berbobot biner dan bukan teks. Catatan: biner memang sudah di **skor terakhir** (`:841`,
`return 6`), jadi urutannya benar; yang belum ada adalah pemisahan slot/anggaran.

**Usulan tambalan (pilihan lane pemilik)** — `src/lib/konteksRepo.ts`:

```diff
@@ -154,6 +154,8 @@ export interface StatKonteksRepo {
   blokirPerJenis: Record<string, number>;
   /** dibuang karena lebih besar dari `BATAS_UKURAN_BERKAS` */
   dilewatiBesar: number;
+  /** dilewati karena isinya biner (tidak dicetak ke daftar; tidak pernah dibaca) */
+  dilewatiBiner: number;
@@ -874,6 +876,7 @@ (inisialisasi `stat` di `saring()`)
     dilewatiBesar: 0,
+    dilewatiBiner: 0,
@@ -911,6 +914,10 @@ (di dalam loop `saring()`, setelah pemeriksaan ukuran)
     if (ukuran > BATAS_UKURAN_BERKAS) {
       stat.dilewatiBesar++;
       continue;
     }
+    if (AKHIRAN_BINER.test(rel)) {
+      stat.dilewatiBiner++;
+      continue;
+    }
```

```diff
@@ (dekat `AKHIRAN_KODE`, sekitar baris 820)
+const AKHIRAN_BINER =
+  /\.(png|jpe?g|gif|webp|bmp|ico|icns|tiff?|svgz|avif|mp[34]|wav|ogg|flac|m4a|mov|avi|mkv|webm|zip|gz|tgz|bz2|xz|7z|rar|jar|war|exe|dll|so|dylib|bin|wasm|pdf|docx?|xlsx?|pptx?|woff2?|ttf|otf|eot|db|sqlite3?|pdb|class|o|a|rlib|pyc|pack|idx)$/i;
```

Alternatif yang lebih halus (kalau biner tetap ingin *terhitung* di `- Languages`): kembalikan dua larik dari
`saring()` (`kandidat` untuk daftar, `semuaTersaring` untuk `susunBahasa/susunPenanda/susunStruktur`).
Lane ini menyerahkan pilihan ke pemilik modul.

---

## 5. Yang sudah terbukti bersih (jangan sampai rusak)

* **Rahasia tidak bocor** — 20 bentuk rahasia (`.env*`, `id_rsa*`, `*.pem`, `*.key`, `credentials.json`,
  `.ssh/`, `.aws/`, `.gnupg/`, `.kdbx`, `.ppk`, `.tfstate`, `.p12`, `.pgpass`, `.npmrc`, `service-account.json`)
  diminta eksplisit: **0 bocor** di ringkasan maupun di `JSON.stringify(konteks)`, alasannya dilaporkan per
  berkas (`blokirPerJenis`). Bentuk menyamar (`.env.`, `.env::$DATA`, `server.PEM`, `client.key:stream`,
  `credentials.json.`, `.ENV`) juga ditolak. Nilai rahasia yang ditanam di isi `.gitignore` **tidak** ikut ke
  keluaran (4 nilai diuji), dan pola token di keluaran (`sk-`/`ghp_`/`AKIA`/JWT/`xox`/PEM) = 0 kecocokan.
* **Rahasia tidak pernah menyentuh jembatan disk** — dengan `cmd` tiruan yang merekam setiap panggilan,
  tidak satu pun berkas rahasia di-stat atau dibaca (hanya `.gitignore` yang dibaca, itupun berkas normal).
* **Injeksi format** — nama berkas berisi baris baru / NUL / byte kontrol **ditolak** (bukan dicetak), jadi
  baris palsu seperti `- Root: /etc` tidak bisa disuntikkan ke ringkasan; keluaran bebas byte kontrol.
* **Anggaran** — batas pindai 5.000, batas tampil 300, dan batas byte 8 MiB benar-benar ditegakkan pada
  20.000 berkas; berkas kecil sesudah berkas besar tetap kebagian (bukan `break`).
* **Determinisme** — dua jalankan berturut byte-identik (20.000 berkas: 34.549 byte; masukan campuran: 1.652 byte);
  tidak ada jam/waktu sistem yang masuk (mtime selalu dari masukan).
* **Input jahat/rusak** — `null`, `{}`, `rel: ''`, `rel: 'x/'`, ukuran `NaN`, mtime negatif, repo kosong,
  `akar: ''`, `berkas` tidak diberikan, sumber yang seluruhnya melempar → semua jalan tanpa crash, dengan pesan
  jelas (`(unknown)`, `none survived`, ukuran `?`, `peringatan[]` bukan exception).
* **Nama aneh** — spasi, Unicode (`файл-Ω.ts`, `emoji😀.ts`), 300 karakter, `:`, `*`, `?`, `|`, huruf besar,
  tanpa ekstensi: rel kembali **persis** seperti masukan, tidak ada path karangan.
* **`.gitignore`** — folder (`dist/`, `sampah/`), pola `**/generated/`, kelas `[abc]`, komentar `#`,
  negasi `!penting.*` (aturan terakhir menang), brace `{a,b}` (tidak didukung — sama seperti git), dan aturan
  buatan repo (`rahasia-internal/`) semuanya dihormati/dipin sesuai perilaku nyata.
* **Murni** — sumber modul tidak memuat pemanggil jaringan aktif (satu-satunya sebutan `fetch`/`http` ada di
  komentar); satu-satunya impor relatif `./agentGuard`, dan `agentGuard.ts` tidak mengimpor apa pun.
  Runtime: 6 patch jaringan dipasang (`fetch`, `XMLHttpRequest`, `WebSocket`, `net.Socket.connect`,
  `http/https.Agent.createConnection`) dan pipa penuh dijalankan — **0 panggilan tertangkap**.

---

## 6. BELUM diuji (apa adanya, bukan klaim)

* **Penyambungan ke Zeph (aiStore/commands) — BUTUH APP.** Lane ini tidak menyentuh `src/lib/aiStore.ts`,
  `src/lib/commands.ts`, atau komponen; tidak ada bukti bahwa blok konteks repo benar-benar disuntikkan ke
  prompt, atau bahwa registry alat memanggil `pindaiKonteksRepo()`. Semua pembuktian di sini node-only.
* **Sisi Rust.** Apakah `listWorkspaceFiles` mengembalikan `rel` yang sudah dinormalkan, dan apakah Rust
  men-*decode* `%2e%2e` / men-*resolve* `..` saat membuka berkas — tidak bisa diperiksa tanpa menjalankan app.
  Ini justru alasan C-1 disarankan gagal-tertutup di sisi TypeScript.
* **Perilaku waktu nyata.** Jumlah berkas repo pengguna nyata, waktu pindai nyata, dan perilaku pada repo
  besar nyata (monorepo) belum diukur; semuanya masukan buatan.
* **`npx tsc --noEmit`** lulus 0 galat, tapi tidak ada uji tipe baru yang ditambahkan lane ini.
* Celah yang **tidak** diperiksa: urutan `prioritas` untuk repo non-JS (mis. Rust/Python saja), perilaku
  `.gitignore` bersarang (`base` per folder) yang lebih dalam dari 2 tingkat, dan `BATAS_BARIS_STRUKTUR`/
  `BATAS_BAHASA` pada repo dengan >40 folder atas.
