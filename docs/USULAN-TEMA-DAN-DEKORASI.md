# Usulan tambalan: tema + dekorasi (berkas di luar budget sunting)

Berkas di bawah ini **tidak** disentuh pada pekerjaan item 181/182 karena dimiliki
lane lain. Isinya usulan tambalan yang bisa dikerjakan pemiliknya, bukan laporan
sudah dikerjakan. Bukti pendukung: `node scripts/uji-halaman-tema.mjs`
(69/69 lulus) dan `docs/LAPORAN-TEMA-DAN-DEKORASI.md`.

## 1. Aturan CSS mati untuk pratinjau lama - `src/styles/settings.css` baris 715-758

Sejak komponen pratinjau disatukan, kelas lama tidak dirender berkas mana pun di
`src/` (harness kasus `B2b` memeriksanya), tetapi aturannya masih ada:

```css
/* baris 715-758 */
.theme-preview { ... }   /* 715-723 */
.tp-side { ... }         /* 724-728 */
.tp-main { ... }         /* 729-737 */
.tp-line { ... }         /* 738-741 */
.tp-kw { ... }           /* 742-745 */
.tp-str { ... }          /* 746-749 */
.tp-fn { ... }           /* 750-753 */
.tp-term { ... }         /* 754-758 */
```

Usulan: hapus baris **715-758** saja.

**Hati-hati:** prefiks `tp-` dipakai komponen lain juga (`.tp-summary`,
`.tp-actions`, `.tp-agents`, `.tp-tab`, ... di baris 37-190 ke atas). Yang boleh
dihapus hanya blok 715-758 di atas; sisanya jangan ikut terbawa.

Gaya pengganti sudah ada di dalam `TemaPratinjau.tsx` (`GAYA_PRATINJAU`, disuntik
sekali dengan id `zpr-gaya-pratinjau-tema`), sengaja dari berkas yang sama dengan
markupnya supaya tidak ada aturan kedua yang bisa tertinggal.

## 2. Kunci kamus untuk teks baru di halaman tema - `src/lib/i18n-src.ts`

Tiga teks di halaman tema masih literal karena menambah kunci kamus berarti
menyunting sumber i18n (di luar budget). Semua literal berbahasa Indonesia, jadi
antarmuka berbahasa Inggris akan melihatnya apa adanya.

| Lokasi | Teks sekarang | Usulan kunci |
| --- | --- | --- |
| `SectionsBasic.tsx:757` (hint kotak cari) | `nama, jenis (gelap/terang), id, atau teks petunjuk` | `theme.search.hint` |
| `SectionsBasic.tsx:772-774` (label pil) | `Semua` / `Gelap` / `Terang` | `theme.filter.all` / `theme.filter.dark` / `theme.filter.light` |
| `SectionsBasic.tsx:837-846` (keadaan kosong) | `Tidak ada tema yang cocok dengan "<kueri>".` / `Tidak ada tema untuk jenis ini.` | `theme.empty` |
| `SectionsBasic.tsx:780-782` (hitungan) | `{tampil.length} / {semua.length}` | `theme.count` dengan dua placeholder |

Nilai kata jenis tetap `dark` / `light`: itu yang dibaca `saringTema`, labelnya
saja yang diterjemahkan.

## 3. Harness CDP lama - `scripts/uji-t6-tema-mode.mjs`

Harness itu mencari selektor halaman tema yang lama. Setelah pekerjaan ini,
penanda yang tersedia (semuanya `data-testid`):

| Penanda | Arti |
| --- | --- |
| `theme-search` | kotak cari tema |
| `theme-jenis` | pil jenis (Semua / Gelap / Terang) |
| `theme-hitung` | hitungan `n / m` |
| `theme-grid` | kisi kartu tema |
| `theme-preview-besar` | pratinjau besar |
| `theme-preview-besar-nama` | label tema yang sedang dipratinjau |

Kartu tema tetap memakai `data-theme-card="<id>"` seperti sebelumnya, dan tiap
pratinjau (kartu maupun besar) memasang `data-tema-pratinjau="<id>"` +
`data-ukuran` + `data-theme`, jadi selektor lama yang menarget kelas
`.theme-preview` / `.tp-kw` sudah tidak akan cocok.

## 4. Opsional: sumber usulan Zeph untuk teks bayangan

`dekorasiCopilot.ts` sengaja tidak memanggil jaringan; saran datang dari fungsi
yang diumpan lewat `pasangPenyediaUsulan()`. Menyambungkannya ke alur Zeph
sungguhan berarti menulis penyedia itu di lapisan yang sudah punya akses ke sana
(mis. dari `CodeMirrorEditor.tsx` memakai `aiStore`/command yang ada) - berkas
`src/lib/aiStore.ts` dan `src/lib/commands.ts` milik lane lain, jadi usulan ini
tidak dikerjakan di sini. Yang sudah pasti: tanpa penyedia terpasang,
`mintaUsulan()` mengembalikan `false` dan tidak ada timer yang berjalan.
