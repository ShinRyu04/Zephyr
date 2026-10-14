# USULAN SUBSET-SAMBUNG: perbaikan temuan S4 (pemilik: `src/lib/subsetTugas.ts`)

Status: **usulan, BELUM diterapkan dan BELUM dijalankan** - berkas `src/lib/subsetTugas.ts`
bukan milik lane ini. Semua angka di bawah adalah keluaran nyata harness yang ada
(`scripts/cek-subset-tugas.mjs --rinci`, `scripts/uji-subset-alat.mjs 9223`), kecuali
bagian "Perkiraan hasil" yang ditandai perkiraan.

## 1. Temuan

Penguji `scripts/cek-subset-tugas.mjs` dan `scripts/uji-subset-alat.mjs` (S4) GAGAL
karena nama yang di-ROUTE prompt dipangkas untuk tugas web:

- `src/lib/zephyrTools/catalog.ts:516` - aturan routing: "buka URL -> `browser_open`",
  "baca halaman -> `browser_read`/`web_fetch`", dengan kalimat penutup "apa pun yang
  di-route prompt WAJIB ikut dikirim".
- `src/lib/zephyrTools/catalog.ts:619` - `browser_read` ada di `TOOL_DIKIRIM_SELALU`.
- Keluaran nyata, basis acuan 26, tugas `web`:
  - `lama` (20): `... browser_open, browser_read, web_fetch`
  - `kirim` (17): `... web_fetch, browser_open` - **`browser_read` tidak ikut**
- Keluaran nyata, gerbang nyata 62, tugas `web`: 5 tool web tersaring jadi **3**;
  yang ikut `web_search, browser_open, browser_nav, browser_list`, yang dipangkas
  `web_fetch, browser_read`. Artinya pada tugas riset web **tidak ada tool pembaca
  halaman sama sekali**; model harus `tool_search` dulu.

## 2. Akar masalah: tabel keluarga menggabungkan kemampuan yang berbeda

`src/lib/subsetTugas.ts:148-153`:

```ts
/* web: mencari/membaca dari jaringan, dan satu keluarga untuk kendali panel */
web_search: ['web-cari'],
web_fetch: ['web-cari'],
browser_open: ['panel-kendali', 'web-cari'],
browser_nav: ['panel-kendali', 'web-cari'],
browser_read: ['panel-kendali', 'web-cari'],
```

Langkah 2 `jejakPemilihan` (baris 601-628) mengambil **satu rumah per keluarga**
(`tersedia[0]` pada `RUMAH[fam]`). Karena `web_search`, `web_fetch`, dan
`browser_read` semuanya ada di keluarga `web-cari`, dua dari tiga selalu dipangkas -
dan `keluargaHilang()` melaporkan **0 keluarga hilang** karena menurut tabel itu
memang "kembar".

Dua penggabungan itu tidak benar secara kemampuan:

| di tabel dianggap kembar | kenyataan |
| --- | --- |
| `web_search` ~ `web_fetch` | mencari di mesin pencari vs mengambil URL tertentu - bukan kemampuan yang sama |
| `web_fetch` ~ `browser_read` | mengambil URL lewat jaringan vs membaca isi panel browser app (bisa berisi halaman yang dibuka pengguna, sesi login) - bukan kemampuan yang sama |

Karena itu "kemampuan tidak hilang" yang dilaporkan 0 pada basis acuan itu **benar
menurut tabel, tapi tabelnya yang salah** - bukan penguji yang perlu dilonggarkan.
Ketiga tool itu juga tidak punya rumah pengganti: `web-cari` dipilih `web_search`
(basis lebar) atau `web_fetch` (basis acuan), dan `panel-kendali` dipilih
`browser_open` **yang cuma membuka panel, bukan membacanya**.

## 3. Usulan A (utamakan ini): pisahkan keluarga sesuai kemampuan nyata

`src/lib/subsetTugas.ts`, `KELUARGA_TOOL` (baris 148-153):

```ts
  /* web: mencari, mengambil URL, dan membaca isi panel = TIGA kemampuan berbeda */
  web_search: ['web-cari'],
  web_fetch: ['web-ambil-url'],
  browser_open: ['panel-kendali'],
  browser_nav: ['panel-kendali'],
  browser_read: ['baca-panel'],
  browser_list: ['panel-kendali'],
```

lalu tambahkan dua keluarga baru itu ke daftar keluarga wajib kelas web
(`KELUARGA_WEB`, sekitar baris 453-520 - definisinya di sana):

```ts
const KELUARGA_WEB = ['web-cari', 'web-ambil-url', 'baca-panel', /* + panel-kendali bila kelas ini butuh panel */];
```

supaya langkah 2 (`jejakPemilihan`) selalu mengirim satu rumah untuk tiap-tiap
kemampuan itu, bukan satu rumah untuk tiga kemampuan sekaligus.

Catatan penerapan:
- Jangan lepas `browser_read` dari `panel-kendali` tanpa memasukkan `baca-panel` ke
  daftar wajib kelas web: kalau tidak, `browser_read` jadi keluarga unik yang **tidak
  diminta** kelas mana pun dan tetap terpangkas (lubang yang sama, tempat lain).
- Urutan `RUMAH['panel-kendali']` tidak perlu diubah; kendali panel tetap satu rumah
  (`browser_open`) seperti sekarang - yang ditambahkan hanya pembaca panel.
- `web_search` tetap boleh jadi satu-satunya rumah `web-cari` (mencari) - tidak ada
  yang diusulkan berubah untuk tool itu.

**Perkiraan hasil (perkiraan, belum dijalankan):** kasus `web` basis acuan 26
`kirim` = 17 -> 18-19 (masih `<= 20`), memuat `web_fetch` **dan** `browser_read`;
gerbang nyata 62 `kirim` = 19 -> 20 (masih `<= 20`), memuat `web_search` + satu
pembaca (`web_fetch` atau `browser_read`); `keluargaHilang` tetap 0; `yatim` tetap 0.
Kalau angka 20 sudah penuh di gerbang lebar, langkah 3 (`tambahan kelas`) memangkas
dirinya sendiri lebih dulu - jadi usulan ini tidak boleh menembus batas.

**Cara membuktikan (harness yang sudah ada, tanpa app dulu):**

```bash
cd /d/Zephyr
node scripts/cek-subset-tugas.mjs --rinci   # kasus 'web' harus LULUS, MAKS tetap 20
npx tsc --noEmit
node scripts/uji-subset-alat.mjs 9223       # S4 harus LULUS, harus == 15/15 lulus
```

## 4. Usulan B (kalau A ditolak): jangan pangkas NAMA yang di-route prompt

Tambah satu pengecualian di langkah pemangkasan: tool yang namanya di-route prompt
katalog untuk kelas yang sedang aktif tidak boleh jadi "rumah cadangan" yang dibuang.
Bentuk paling ringkas: daftar `ROUTE_WEB = ['web_search','web_fetch','browser_open','browser_read']`
diperlakukan seperti `TOOL_INTI_TUGAS` **hanya untuk kelas yang memakai web**
(bukan inti global - untuk tugas tulis tool web memang harus dibuang, itu diuji S2
dan tetap lulus).

Kelemahan B dibanding A: ia menutup gejala (nama hilang) tanpa membereskan tabel
keluarga yang salah, jadi laporan `keluargaHilang == 0` tetap menyesatkan untuk
kemampuan baca-panel/ambil-URL.

## 5. Jangan lakukan: melonggarkan penguji

Penguji di lane ini **tidak dilonggarkan** supaya hijau. Bentuk pelanggaran yang
sengaja TIDAK diambil:

- menurunkan pemeriksaan S4 menjadi "keluarga web punya rumah" (itu sudah 0 keluarga
  hilang sekarang - hijau semu),
- menghapus larangan `yatim`, atau
- mengubah `cek-subset-tugas.mjs` supaya kolom kelas web dianggap lulus.

Ketiganya akan menyembunyikan lubang "model tidak bisa membaca halaman tanpa
`tool_search`" pada tugas yang paling butuh kemampuan itu.

## 6. Batas usulan ini

Tidak ada satu pun angka di dokumen ini yang berasal dari percobaan run agen nyata
end-to-end (BUTUH APP): yang diukur adalah daftar tool yang dibangun jalur kirim.
Usulan A/B juga belum pernah dijalankan karena `src/lib/subsetTugas.ts` milik lane
lain; pemiliknya yang harus menerapkan lalu menjalankan dua harness di atas.
