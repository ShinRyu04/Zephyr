# USULAN-analis-gambar — perubahan di berkas lane lain

Usulan saja: **tidak satu pun berkas di bawah ini diubah** oleh lane `ZEPH-ANALIS-GAMBAR`.
Semua yang dibutuhkan jalur gambar sudah ada di `src/lib/analisGambar.ts`, dan setiap
usulan di sini adalah penggantian yang bisa dilakukan satu per satu tanpa menyentuh yang
lain.

Ringkasnya: hari ini ada **lima** tempat yang masing-masing memutuskan sendiri "ini gambar,
ini boleh dikirim" — tiga di `CliChat.tsx`, satu di `clipboard.ts`, satu di `aiStore.ts`.
Lima aturan, lima jawaban berbeda untuk berkas yang sama (dan sebagian besar diam).

---

## U1 — `CliChat.tsx:453-455` · mime dikarang dari ekstensi

```ts
const g = await bacaGambar(p);
const url = `data:image/${p.split('.').pop()?.toLowerCase() === 'jpg' ? 'jpeg' : p.split('.').pop()?.toLowerCase()};base64,${g.base64}`;
setImages((xs) => (xs.some((x) => x.path === p) ? xs : [...xs, { path: p, url }]));
```

`.svg` yang dipilih lewat **+ / attach** menjadi `data:image/svg+xml;base64,…` dan tetap
sampai ke provider; `.bmp`, `.tiff`, `.avif` juga. Ekstensi juga bukan mime: berkas tanpa
ekstensi atau `.jfif` menghasilkan mime yang salah.

```ts
import { gambarDariBerkas } from '../../lib/analisGambar';
const g = await bacaGambar(p);
const img = gambarDariBerkas({ nama: p, base64: g.base64 });
if (!img.ok) { setToast(sensorBase64(img.pesan)); return; }
setImages((xs) => (xs.some((x) => x.path === p) ? xs : [...xs, { path: p, url: img.nilai.dataUrl }]));
```

## U2 — `CliChat.tsx:489` dan `:1388` · `startsWith('image/')`

```ts
if (items[i].type.startsWith('image/')) { file = items[i].getAsFile(); break; }
```

`image/svg+xml` lolos filter ini. Limbahnya kecil (SVG dari clipboard jarang), tapi ini
satu-satunya tempat yang tahu **byte-nya belum dibaca** — dan pemeriksaan yang sama harus
dipakai di dua tempat itu.

```ts
import { mimeDiizinkan } from '../../lib/analisGambar';
if (mimeDiizinkan(items[i].type)) { … }
```

(Pemeriksaan byte sungguhan tetap terjadi di dalam `siapkanGambar`; ini hanya supaya
handler tidak mengklaim menerima format yang pintu depannya nanti tolak.)

## U3 — `CliChat.tsx:529-544` · temp file ditulis sebelum ada yang memeriksa

```ts
const m = /^data:image\/([a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl);
…
const path = await simpanGambarTemp(m[2], ext);
```

Regex ini menerima **setiap** `image/*` dan tidak melihat ukuran: screenshot 40 MB yang
di-paste ditulis ke disk utuh sebelum apa pun sempat menolaknya. Kalau nanti ditolak, yang
tersisa hanyalah berkas besar di temp tanpa penjelasan.

```ts
import { terimaGambar, adapterKanvas, sensorBase64 } from '../../lib/analisGambar';
const img = await terimaGambar({ sumber: 'tempel', dataUrl }, adapterKanvas());
if (!img.ok) { setToast(sensorBase64(img.pesan)); return; }
const ext = img.nilai.mime === 'image/jpeg' ? 'jpg' : img.nilai.mime.split('/')[1];
const path = await simpanGambarTemp(img.nilai.base64, ext);
setImages((xs) => (xs.some((x) => x.path === path) ? xs : [...xs, { path, url: img.nilai.dataUrl }]));
setToast(tx('Screenshot attached'));
```

Perhatikan urutannya berubah: **validasi + perkecil dulu, tulis berkas kemudian**. Itu
membalik perilaku sekarang (tulis dulu, tidak pernah periksa) dan sekaligus membuat
gambar besar tetap terkirim alih-alih hilang.

## U4 — `clipboard.ts:37` · hanya lebar yang diperkecil

```ts
const scale = width > 1600 ? 1600 / width : 1;
```

Screenshot tinggi (mis. 1000×8000, sangat lazim untuk tangkapan halaman penuh) tidak
tersentuh karena lebarnya 1000 < 1600: 8 megapiksel di-encode ulang jadi PNG dan bisa
jauh di atas 3,5 MB. `ANALIS_SISI_MAKS` memakai **sisi terpanjang**, jadi divergensinya
nyata.

```ts
const sisi = Math.max(width, height);
const scale = sisi > ANALIS_SISI_MAKS ? ANALIS_SISI_MAKS / sisi : 1;
```

Sekalian: `clipboardReadImage()` sudah memegang `width`/`height` di baris 32 tapi membuang
keduanya di baris 51 — mengembalikan `{ dataUrl, lebar, tinggi }` akan membuat
`rencanaPerkecil` bisa menghitung langkah skala yang benar untuk gambar clipboard besar,
bukannya menebak.

## U5 — `aiStore.ts:3477-3498` · `addDraftImage` menerima semua mime, menolak yang besar

```ts
const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
…
if (bytes > IMAGE_MAX_BYTES) {
  set({ toast: tf('Image is larger than 3.5 MB and was not attached', {}) });
  return false;
}
```

Dua hal:

1. Pola `data:[^;,]+` menerima **mime apa pun** — `data:text/plain;base64,…` dan
   `data:image/svg+xml;base64,…` masuk ke `draftImages` lalu dikirim.
2. Yang besar **ditolak**, tanpa jalur memperkecil. Store memang tidak boleh memanggil
   canvas (tidak ada DOM di sana), tapi pemanggilnya bisa: perkecil dulu, baru masukkan.

Usulan minimal — pakai pintu depan untuk memutuskan, di pemanggil:

```ts
// di pemanggil addDraftImage (panel/CLI), bukan di store:
const img = await terimaGambar({ sumber: 'tempel', dataUrl }, adapterKanvas());
if (!img.ok) { toast(sensorBase64(img.pesan)); return; }
addDraftImage(img.nilai.dataUrl);
```

dan di store, ganti regex-nya dengan `uraiDataUrl` + `mimeDiizinkan` (dua fungsi murni,
aman dipanggil dari store). Kalau `addDraftImage` tetap harus memeriksa sendiri, rumus
byte-nya juga bisa disatukan: versi di sana (`floor(len*3/4) - padding`) dan
`hitungByteBase64` (`floor(tanpaPad*3/4)`) sepakat untuk payload berpadding benar —
diuji terhadap `Buffer` untuk 901 bentuk di `B1` — tapi dua rumus yang harus sepakat adalah
dua rumus yang cepat atau lambat tidak sepakat.

Konstanta `IMAGE_MAX_BYTES = 3_500_000` (baris 146) dan `MAX_IMAGES = 10` (baris 144) sudah
sama dengan `ANALIS_MAKS_BYTE`/`ANALIS_MAKS_GAMBAR`; `K2` menguji kesamaannya, jadi tidak
ada yang perlu diubah angkanya. Impor salah satunya ke yang lain akan menghapus risiko itu
sepenuhnya.

## U6 — pendaftaran harness

`scripts/uji-analis-gambar.mjs` berdiri sendiri (`node scripts/uji-analis-gambar.mjs`,
exit 0/1, 64 pemeriksaan, tanpa jaringan). Runner `scripts/verify*.mjs` dimiliki lane lain,
jadi biar pemiliknya yang menambahkan satu baris pemanggilan; harness ini sengaja tidak
menyentuh berkas mana pun di sana.

---

## Yang tidak diusulkan

- **Menambah format.** Daftar putihnya png/jpeg/webp/gif karena itu yang benar-benar
  dilayani model vision. `svg` bukan gambar bagi model (tidak bisa di-raster oleh provider
  sebagai gambar), `bmp`/`tiff` ditolak sebagian provider, dan `avif` belum seragam. Kalau
  nanti ada alasan kuat, yang berubah adalah `MIME_DIIZINKAN` + `AWALAN` + `mimeDariNama`
  di satu berkas, dan `R1`–`R6` di harness memberi tahu persis apa yang ikut berubah.
- **Menaikkan batas ukuran.** Batasnya bukan angka sembarang: 3,5 MB berkas ≈ 4,7 MB badan
  request setelah penggelembungan base64. Menaikkannya memperbesar request terbesar yang
  diserialisasi aplikasi ini, dan itu keputusan produk, bukan keputusan jalur gambar.
