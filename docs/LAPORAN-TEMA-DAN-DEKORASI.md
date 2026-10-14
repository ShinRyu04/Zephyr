# Laporan: cari tema + pratinjau kaya + dekorasi ala Copilot

Lingkup: item **181** (ZEPH-TEMA-CARI-PRATINJAU-TANPA-DUP) dan item **182**
(ZEPH-DEKORASI-KODE-ALA-COPILOT), di atas artefak yang sudah ada di disk.

Bukti: `node scripts/uji-halaman-tema.mjs` (harness baru, node-only) -
**70/70 lulus, exit 0**, dijalankan pada commit kerja branch
`feat/ai-panel-vscode-layout`. Keluaran mentahnya ada di bagian bawah berkas ini.

## Berkas

| Berkas | Peran |
| --- | --- |
| `src/components/settings/TemaPratinjau.tsx` | SATU komponen pratinjau; token + cip warna, gaya tata letak disuntik dari berkas ini |
| `src/components/settings/temaFilter.ts` | penyaring tunggal: nama + teks petunjuk + jenis (kata `gelap`/`terang` di kueri ikut berlaku) |
| `src/components/settings/SectionsBasic.tsx` | **halaman tema** (hanya berkas ini yang disunting di luar kepemilikan) |
| `src/components/editor/dekorasiMurni.ts` | logika murni: kelas baris, dedup/klamp baris, kelayakan saran |
| `src/components/editor/dekorasiCopilot.ts` | dua dekorasi: sorot baris + teks bayangan dengan Terima/Tolak |
| `src/components/editor/CodeMirrorEditor.tsx` | **berkas editor** yang disambungkan (hanya satu) |
| `scripts/uji-halaman-tema.mjs` | harness baru, node-only, 69 kasus |

## Penyambungan (titik sambung, dengan baris)

### Halaman tema - `src/components/settings/SectionsBasic.tsx`

| Baris | Isi |
| --- | --- |
| 8-9 | `import { saringTema, type JenisTema } from './temaFilter'` dan `import { PratinjauTema } from './TemaPratinjau'` |
| 728-729 | state `kueri` + `jenis` |
| 738 | state `sorot` (tema yang sedang ditunjuk kursor) |
| 741 | `const tampil = saringTema(semua, kueri, jenis, tr)` - **satu** hasil penyaring |
| 745-748 | `besarId` = yang ditunjuk, kalau tidak ada yang aktif, kalau tidak ada kartu pertama yang lolos saring |
| 758-765 | kotak CARI: `TextInput testid="theme-search"` → `onChange={setKueri}` |
| 766-776 | pil jenis: `Pills testid="theme-jenis"` dengan pilihan Semua / Gelap / Terang |
| 780-782 | hitungan `{tampil.length} / {semua.length}` (bukan angka yang dihitung ulang) |
| 795 | pratinjau besar: `<PratinjauTema themeId={besarId} ukuran="besar" accent={theme.accent} />` |
| 829 | di dalam kartu: `<PratinjauTema themeId={th.id} accent={theme.accent} />` (ukuran bawaan `kartu`) |
| 815-817 | `onMouseEnter`/`onFocus` → `setSorot(th.id)`, `onMouseLeave` → lepas penunjukan |
| 837-846 | keadaan kosong memakai `tampil.length === 0` - hasil penyaring yang sama; menyebut kueri yang tidak ketemu |

Komponen pratinjau yang SAMA dipakai di kedua tempat; yang membedakan hanya
`ukuran`, dan itu urusan gaya (kartu menyembunyikan label token, pratinjau besar
memperbesar kodenya).

### Editor - `src/components/editor/CodeMirrorEditor.tsx`

| Baris | Isi |
| --- | --- |
| 68 | `import { dekorasiBarisUbah, dekorasiCopilot } from './dekorasiCopilot'` |
| 158 | `out.push(...dekorasiCopilot({ sorotBaris: e.gitGutter, usulanInline: e.ghostText }))` - jalur hidup/mati dari Settings |
| 811-814 | sakelar `gitGutter` mati / berkas bukan di repo → `effects: [setBarsEffect([]), dekorasiBarisUbah([])]` (dibersihkan bersamaan) |
| 831-832 | `const baris = parseDiff(patch)` **sekali**, lalu `effects: [setBarsEffect(baris), dekorasiBarisUbah(baris)]` |

Satu diff, satu parse, satu dispatch: batang di gutter dan sorot baris tidak bisa
lagi berbeda sumber.

## Item 181

1. **Cari** menyaring nama tema **dan** jenis. Kata jenis yang diketik di kueri
   ikut berlaku (`terang`/`gelap`, juga `light`/`dark`), kata benda umum seperti
   `tema`/`theme` dibuang, dan teks petunjuk yang **sudah diterjemahkan** juga
   dicari - jadi mengetik kata yang terlihat di kartu tidak berakhir di "tidak ada
   tema yang cocok". Dua kata jenis yang bertentangan menghasilkan keadaan kosong
   yang jujur, bukan daftar penuh.
2. **Pratinjau kaya**: potongan kode 5 baris (10 token berbeda di teks) + deretan
   cip untuk **11 token `--syn-*`** dan **8 warna antarmuka** utama. `--syn-invalid`
   tidak dipakai di teks contoh (kode contoh yang sengaja rusak terlihat seperti bug
   tema) tetapi tetap terlihat sebagai cip - dan harness menuntut kesebelasnya
   hadir di tiap tema.
3. **Tanpa duplikasi**: hanya satu berkas di `src/` memuat `data-tema-pratinjau`
   (`TemaPratinjau.tsx`), markup kedua ukuran identik setelah kelas skala dan
   penanda ukuran disamakan, jumlah token/cip sama di kedua ukuran untuk semua 19
   tema. Markup lama (`tp-kw`, `tp-side`, `tp-line`) sudah tidak dirender berkas
   mana pun di `src/`.

## Item 182

1. **Sorot baris** (`dekorasiBarisUbah` → `sorotField`): kelas `cm-dekorasi-baru`
   (baris baru) dan `cm-dekorasi-ubah` (baris berubah); `deleted` sengaja kosong
   karena tidak ada baris di buffer untuk diwarnai. Baris di luar dokumen,
   nomor tidak bulat, dan duplikat dibuang di `barisUnik`; jumlah dibatasi
   `SOROT_MAX = 500`. Suntingan membersihkan sorot (nomor baris dari diff HEAD
   tidak lagi cocok dengan buffer). Jalur hidup/mati dari `editorSettings.gitGutter`.
2. **Teks bayangan** (`usulanField`): saran tampil inline di posisi kursor sebagai
   widget dengan tombol Terima/Tolak (Tab/Esc), dibatalkan saat kursor pindah atau
   buffer berubah. **Tanpa jaringan**: modul ini tidak memuat `fetch`, URL, `invoke`,
   atau `listen`; sumber saran adalah fungsi yang diumpan lewat
   `pasangPenyediaUsulan()`. Tanpa penyedia, `mintaUsulan()` mengembalikan `false`
   (bukan promise kosong yang tak bisa dibedakan dari "model menjawab kosong"), dan
   tidak ada timer yang berjalan sia-sia.
3. **Warna ikut tema**: gaya dekorasi dipasang lewat `EditorView.baseTheme` dengan
   `var(--added)` / `var(--modified)` dan latar `var(--added-tipis, color-mix(...))`.
   Tidak ada satu pun nilai warna keras di berkas dekorasi maupun di berkas
   pratinjau - harness menolak heksadesimal di keduanya. Karena dekorasi memakai
   variabel yang sama dengan batang gutter, baris yang disorot dan batangnya tidak
   bisa berbeda warna.

## Yang merah (informasi, bukan aib)

Dua kasus sempat merah dan keduanya menunjuk bug/bacaan yang nyata, bukan uji yang
disetel supaya lulus:

* `D3`/`D18` - `barisUnik` meloloskan nomor baris **tidak bulat** (`1.5`), karena
  penjaganya `Number.isFinite`. Diff hanya menghasilkan bilangan bulat, jadi 1.5
  berarti ada yang salah di hulu - dan membiarkannya lewat membuat `doc.line(1.5)`
  dipanggil. Diperbaiki jadi `Number.isInteger` di `dekorasiMurni.ts`.
* `B5` - pembanding markup semula mengabaikan `data-ukuran`, sehingga dua ukuran
  tidak pernah bisa "identik". Diperbaiki di harness: yang dibandingkan adalah
  markup setelah kelas skala **dan** penanda ukuran disamakan - jadi buktinya
  "sama kecuali dua hal yang memang sengaja berbeda".

## Sisa

* Aturan CSS untuk kelas pratinjau lama masih ada di `src/styles/settings.css`
  (baris 715-746: `.theme-preview`, `.tp-side`, `.tp-line`, `.tp-kw`). Tidak ada
  yang merender kelas itu lagi, tapi berkas itu milik lane lain - usulan
  penghapusannya ada di `docs/USULAN-TEMA-DAN-DEKORASI.md`.
* Hitungan `n / m` dan teks keadaan kosong masih literal (kunci kamus baru berada
  di luar budget sunting) - juga tercatat di berkas usulan.
* Kasus yang butuh aplikasi hidup (piksel, perilaku timer saat mengetik, tombol
  Terima/Tolak yang benar-benar diklik) tetap tugas harness CDP; di berkas ini
  tidak ada kasus yang ditandai `BUTUH APP`.

## Gerbang tipe

```
$ npx tsc --noEmit
TSC_EXIT=0        # tanpa satu pun diagnostik
```

Tidak ada galat dari berkas yang saya sentuh. Satu catatan kejujuran: pada satu
jalankan di tengah pekerjaan, `tsc` sempat melaporkan
`src/lib/aiStore.ts(31,3): error TS6133` - berkas itu milik lane lain dan
mtime-nya (05:59) lebih baru daripada suntingan saya, jadi yang terbaca adalah
keadaan berkas saat sedang ditulis ulang lane tersebut. Jalankan berikutnya
(20 detik kemudian) kembali bersih: `TSC_EXIT=0`.

## Keluaran harness (apa adanya)

```
$ node scripts/uji-halaman-tema.mjs
LULUS  A1   kueri kosong = daftar penuh (5/5)
LULUS  A2   cari nama 'nord' -> nord,nord-light
LULUS  A3   huruf besar/kecil tidak penting
LULUS  A4   kata jenis di dalam kueri: 'terang' -> nord-light,solarized-light
LULUS  A5   'gelap' -> zephyr-dark,nord,everforest-dark
LULUS  A6   'light' (Inggris) sama artinya
LULUS  A7   dua kata jenis yang bertentangan = tidak ada jawaban, bukan daftar penuh
LULUS  A8   pil jenis 'light' -> nord-light,solarized-light
LULUS  A9   pil DAN kueri berlaku bersamaan
LULUS  A10  pil 'light' + kueri 'gelap' = kosong (bukan diam-diam daftar penuh)
LULUS  A11  kata benda 'tema' dibuang, sisanya tetap dicari
LULUS  A12  cari teks petunjuk yang SUDAH diterjemahkan -> everforest-dark
LULUS  A13  tanpa terjemahan, kunci kamus sendiri yang jadi teks dan tetap bisa dicari -> solarized-light
LULUS  A14  tanpa penerjemah teks petunjuk, pencarian teks jadi tidak cocok (bukti suntikan tr memang dipakai)
LULUS  A15  halaman memanggil saringTema(semua, kueri, jenis, tr)
LULUS  A16  kotak cari terpasang ke state kueri (testid theme-search)
LULUS  A17  pil jenis terpasang ke state jenis, berlabel Gelap/Terang (kata yang sama dengan yang dikenali saringTema)
LULUS  A18  kisi, hitungan n/m, dan keadaan kosong memakai SATU hasil penyaring
LULUS  A19  keadaan kosong memakai hasil penyaring yang sama
LULUS  A20  keadaan kosong punya penanda sendiri (theme-kosong) dan menyebut kueri yang dicari
LULUS  B1   berkas pemilik markup pratinjau: src/components/settings/TemaPratinjau.tsx
LULUS  B2   markup pratinjau LAMA (strip tiga batang / sisi palsu) sudah tidak dirender halaman
LULUS  B2b  tidak ada berkas di src/ yang merender kelas pratinjau lama; masih memakai: (tidak ada)
LULUS  B3   halaman memakai komponen yang sama untuk kartu DAN pratinjau besar
LULUS  B4   tema diuji: 19 (sumber: THEMES (modul asli))
LULUS  B5   markup kedua ukuran IDENTIK setelah kelas skala dan penanda ukuran disamakan (satu komponen, dua skala)
LULUS  B6   jumlah token dan cip sama di kedua ukuran untuk semua tema
LULUS  B7   perbedaan kedua ukuran hanyalah gaya (label token disembunyikan di kartu, kode diperbesar di pratinjau besar)
LULUS  B8   potongan kode memakai 10 token berbeda di teks (bukan strip tiga batang): --syn-keyword --syn-function --syn-variable --syn-type --syn-operator --syn-comment --syn-string --syn-tag --syn-attr --syn-number
LULUS  C1   TOKEN_SINTAKS berisi 11 token unik: --syn-keyword --syn-string --syn-number --syn-comment --syn-function --syn-variable --syn-type --syn-operator --syn-tag --syn-attr --syn-invalid
LULUS  C2   sampel warna antarmuka: --bg --surface --surface-2 --border --text --text-muted --accent --editor-bg
LULUS  C3   token di :root = token yang dipakai pratinjau (11 di CSS, 11 di komponen)
LULUS  C4   19 blok tema mendefinisikan --syn-*; yang jumlahnya bukan 11: (tidak ada)
LULUS  C5   tema dengan token tidak lengkap di bloknya sendiri: (tidak ada)
LULUS  C6   SEMUA 19 tema memakai kesebelas token (baik sebagai warna token maupun cip); kurang: (tidak ada)
LULUS  C7   tiap pratinjau memasang data-theme temanya sendiri (token tema itu yang dipakai walau belum dipilih)
LULUS  C8   sampel warna antarmuka utama ikut dirender sebagai cip
LULUS  C9   gaya tata letak pratinjau tanpa satu pun nilai warna keras
LULUS  C10  semua warna inline dari var(--...): bersih
LULUS  C11  aksen pilihan pembaca diteruskan ke pratinjau (dan gaya tata letak terpasang)
LULUS  D1   kelas baris: cm-dekorasi-baru / cm-dekorasi-ubah
LULUS  D2   baris dihapus tidak menghasilkan kelas (tidak menyorot baris yang tidak disentuh siapa pun)
LULUS  D3   barisUnik: ganda diambil yang pertama, di luar dokumen dibuang, urut menaik -> 2:added 4:modified
LULUS  D4   batas sorotan 500 baris ditegakkan
LULUS  D5   pantulan yang sudah diketik dipotong dari saran
LULUS  D6   saran yang isinya sudah sama dengan yang diketik ditolak (tidak menduplikasi teks)
LULUS  D7   saran kosong ditolak
LULUS  D8   saran yang sudah ada di kanan kursor ditolak
LULUS  D9   kedua sakelar mati -> nol ekstensi (tidak ada field/keymap/timer yang dipasang)
LULUS  D10  sakelar sorot saja -> hanya field sorot
LULUS  D11  sakelar teks bayangan saja -> hanya field usulan (+ tombol + pemicu)
LULUS  D12  kedua sakelar -> 6 ekstensi (sorot sendiri 2, usulan sendiri 5)
LULUS  D13  editor mengimpor dekorasiCopilot + dekorasiBarisUbah
LULUS  D14  jalur hidup/mati dekorasi diambil dari Settings (gitGutter + ghostText)
LULUS  D15  satu parseDiff mengisi batang gutter DAN sorot baris dalam satu dispatch
LULUS  D16  kedua dekorasi dibersihkan bersamaan saat sakelar mati / berkas bukan repo
LULUS  D17  dekorasi tanpa jalur jaringan sendiri (ditemukan: tidak ada); sumber saran = fungsi yang diumpan
LULUS  D18  efek dekorasiBarisUbah menghasilkan 2 kelas di state: cm-dekorasi-baru cm-dekorasi-ubah
LULUS  D19  suntingan membersihkan sorot (nomor baris dari diff HEAD tidak lagi cocok dengan buffer)
LULUS  D20  tanpa penyedia terpasang tidak ada saran dan TIDAK ada panggilan jaringan (fungsi mengembalikan false, bukan promise kosong)
LULUS  D21  saran dari penyedia yang diumpan, dipotong pantulannya -> " const b = 2;"
LULUS  D22  konteks dikirim apa adanya: baris 1 = "const a = 1;", lang typescript
LULUS  D23  Terima: teks masuk di kursor dan widget dibersihkan -> "const a = 1; const b = 2;\n"
LULUS  D24  Terima tanpa saran menunggu = false (tidak menyisipkan apa pun)
LULUS  D25  Tolak: widget dibuang, dokumen tidak disentuh
LULUS  D26  Tolak tanpa saran menunggu = false
LULUS  D27  saran dibatalkan saat kursor pindah (tidak ditempel di posisi yang tidak diminta)
LULUS  D28  warna dekorasi dari variabel tema (--added/--modified), tanpa nilai keras
LULUS  D29  kelas yang dihasilkan kelasBaris memang yang diberi gaya (latar tipis + garis tepi)
LULUS  D30  pratinjau dan dekorasi sama-sama mewarnai lewat variabel, bukan warna keras

== 70/70 lulus ==
```

## Cara harness bekerja

Modul TS/TSX asli dibundel esbuild (entri sementara di
`node_modules/.zpr-uji-halaman-tema`, dihapus lagi di akhir) lalu diimpor node -
jadi yang diuji adalah kode yang dikirim, bukan salinan logikanya. `react` dan
`react-dom` sengaja **tidak** ikut dibundel (build CommonJS `react-dom/server`
memuat `stream` dengan `require()` dinamis yang ditolak esbuild) dan diimpor node
lewat `createRequire`. Pratinjau benar-benar dirender dengan
`renderToStaticMarkup` untuk **semua 19 tema** di dua ukuran.
