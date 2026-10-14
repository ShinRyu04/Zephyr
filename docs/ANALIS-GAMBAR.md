# ANALIS-GAMBAR — jalur gambar (vision) Zeph

Modul: `src/lib/analisGambar.ts` · Harness: `scripts/uji-analis-gambar.mjs`

Satu **pintu depan** yang memutuskan: format apa yang diterima, seberapa besar dianggap
terlalu besar, apa yang terjadi kalau terlalu besar, dan apa yang boleh dikatakan sebuah
penolakan. Semua keputusan itu ada di satu berkas; sebelumnya tersebar di paste handler,
file picker, dan drag-and-drop, masing-masing dengan aturannya sendiri.

```
                       ┌────────────────────────────────────────────┐
 tempel / pilih / lampir ──▶ │ terimaGambar(kandidat, adapter?)           │
                       │  1. urai + normalisasi mime                 │
                       │  2. mime ∈ daftar putih?                    │
                       │  3. byte cocok dengan mime yang diklaim?    │
                       │  4. ukuran ≤ batas?                         │
                       │     tidak → rencanaPerkecil + adapter       │
                       │  5. masih tidak muat → tolak + angka nyata  │
                       └────────────────────┬───────────────────────┘
                                            ▼
                          GambarSiap { dataUrl, mime, byte, nama, … }
                                            ▼
                       ChatMsg.images : string[]  →  adapter Rust
```

---

## 1. Cara gambar masuk

Tiga jalur, tiga fungsi bernama supaya pemanggilnya terbaca sebagai dokumentasi:

| Jalur | Fungsi | Yang diserahkan pemanggil |
| --- | --- | --- |
| Tempel (clipboard, screenshot) | `gambarDariTempel(dataUrl)` | data URL utuh dari clipboard — clipboard selalu memberi PNG |
| Pilih berkas / drag-and-drop | `gambarDariBerkas({ nama, mime?, base64 })` | byte yang sudah base64 + nama berkas (mime opsional; kalau kosong diturunkan dari ekstensi) |
| Lampiran (`@path`, dokumen) | `gambarDariLampiran({ nama, dataUrl })` | nama + data URL hasil pembaca berkas |

Semuanya bisa dipanggil langsung, atau lewat jalur lengkap yang juga mengecilkan gambar:

```ts
import { terimaGambar, adapterKanvas, barisLog, sensorBase64 } from './analisGambar';

const hasil = await terimaGambar(
  { sumber: 'tempel', dataUrl, nama: 'screenshot.png' },
  adapterKanvas(),            // null = jangan mengecilkan, tolak dengan jujur
);
if (hasil.ok) {
  log.info(barisLog(hasil.nilai));              // "image image/png 1,2 MB from tempel"
  pesan.images = daftarDataUrl([hasil.nilai]);  // yang dibaca adapter Rust
} else {
  toast(sensorBase64(hasil.pesan));             // kode + pesan, tanpa payload
}
```

### Mime yang diterima (daftar putih, bukan tebakan)

`image/png`, `image/jpeg`, `image/webp`, `image/gif` — `MIME_DIIZINKAN`.

Alias dinormalkan sebelum diperiksa: `image/jpg` dan `image/pjpeg` → `image/jpeg`,
`image/x-png` → `image/png`, huruf besar-kecil tidak masalah, parameter dibuang
(`image/jpeg; charset=x` → `image/jpeg`). `.svg`, `.bmp`, `.tiff`, `.pdf`, `text/plain`,
`application/octet-stream` ditolak — dan **pesannya menyebut apa yang ditolak**:

```
Image format "image/svg+xml" is not supported. Allowed: image/png, image/jpeg,
image/webp, image/gif (max 3,5 MB each).
```

### Mime yang diklaim harus cocok dengan byte-nya

Mime yang diklaim tidak dipercaya sendiri. `tebakMimeDariBase64` membaca magic bytes
(PNG `89 50 4E 47 0D 0A`, JPEG `FF D8 FF`, `GIF`, WebP lewat `RIFF…WEBP`) dan menolak
ketidakcocokan. Berkas teks yang diganti nama jadi `.png` tidak sampai ke provider:

```
Declared as image/png, but the bytes are not a recognised image (png, jpeg, webp or gif).
The file may be misnamed or empty.

Declared as image/jpeg, but the bytes are image/png. Rename or re-export the file,
or attach it as image/png.
```

Awalan base64-nya sengaja hanya menutup **byte utuh** (`iVBORw0K` = 6 byte pertama tanda
tangan PNG, `/9j` = 3 byte JPEG, `R0lG` = "GIF"). Satu karakter lebih panjang akan
mencapai byte *sesudah* magic, dan byte itu berbeda antar berkas: byte ke-9 PNG adalah
panjang chunk, byte ke-4 GIF adalah digit versi. Awalan yang terlalu panjang menolak PNG
dan GIF yang sah — persis bug yang dikunci oleh pemeriksaan `F4`/`F5` di harness.

## 2. Batas ukuran (angkanya)

| Batas | Nilai | Sama dengan |
| --- | --- | --- |
| Maksimum **per gambar** (setelah didekode) | **3.500.000 byte (3,5 MB)** — `ANALIS_MAKS_BYTE` | `aiStore.IMAGE_MAX_BYTES` |
| Maksimum **per pesan** | **10 gambar** — `ANALIS_MAKS_GAMBAR` | `aiStore.MAX_IMAGES` |
| Sisi terpanjang setelah diperkecil | **1600 px** — `ANALIS_SISI_MAKS` | target `clipboard.ts` (lihat catatan di bawah) |
| Tangga perkecil (kualitas × skala) | `0.85/0.7/0.7/0.6` × `1/1/0.6/0.35` | — |

3,5 MB dipilih karena base64 menggelembung ~33%: 3,5 MB berkas ≈ **4,7 MB badan request**,
sudah request terbesar yang ingin diserialisasi aplikasi ini. Dua batas berbeda di satu
aplikasi adalah cara sebuah gambar lolos dari panel lalu dijatuhkan oleh store, jadi
angkanya sengaja disamakan dan **diuji setara** (`K2`).

Tangga perkecil punya 4 langkah karena sumber penghematannya berbeda: langkah 1–2 membeli
byte dari encoder saja (murah, tak terlihat pada 1600 px), langkah 3–4 mengecilkan kisi
piksel. Berhenti sebelum langkah kisi adalah cara sebuah gambar ditolak padahal jelas
kelihatan muat.

Dimensi (`lebar`/`tinggi`) opsional dan hanya dipakai menghitung langkah skala. **Gambar
yang dimensinya tidak diketahui tidak pernah diasumsikan kecil**: `skalaAwal` tetap 1 dan
yang bekerja hanya langkah encoder, karena mengarang skala yang tidak bisa dihitung sama
dengan memperbesar gambar diam-diam.

## 3. Kalau terlalu besar

Bukan hilang diam-diam. Urutannya:

1. `rencanaPerkecil` (murni — angka masuk, langkah keluar, tanpa canvas) memutuskan
   `tanpa` / `kecilkan` / `tolak`. GIF yang terlalu besar langsung `tolak`, karena
   mengecilkannya menghancurkan animasinya.
2. `perkecilGambar` menjalankan tangga lewat adapter yang disuntikkan, dan **setiap hasil
   diperiksa ulang dengan aturan yang sama** seperti gambar baru (mime, byte, batas).
3. Habis tangga dan masih besar → penolakan yang menyebut angka nyatanya:

```
Image is 3.500.001 bytes (3,5 MB), over the 3.500.000-byte limit (3,5 MB).
Zeph will try to shrink it first.

Image is still 4.950.008 bytes (5,0 MB) after 4 resize attempts (limit 3.500.000 bytes).
Crop it or lower the resolution and attach it again.
```

Tanpa adapter (`terimaGambar(k, null)`), penolakan adalah jawaban yang jujur, bukan
penjatuhan silent. Angka ribuan ditulis oleh `pemisah()` buatan sendiri, bukan
`toLocaleString()`, supaya pesan tidak berubah mengikuti locale mesin user — dan supaya
selisih "1 byte di atas batas" dan "1 MB di atas batas" tetap terbaca.

Adapter nyatanya hanya satu potong kecil: `adapterKanvas()` (~20 baris, `canvas` +
`toDataURL`; PNG tetap PNG supaya transparansi tidak diratakan, selain itu ke JPEG karena
encoder JPEG-lah yang benar-benar menghormati angka kualitas). Semua kebijakan ada di
planner murni, jadi seluruh kebijakan ukuran bisa diuji di node dengan adapter palsu.

## 4. Kredensial & isi berkas tidak pernah masuk log

- `ringkasGambar()` **tidak punya field base64 sama sekali** — bukan "kosong secara
  kebetulan", tapi tidak ada di tipe, jadi tidak ada call site yang bisa membocorkannya.
- `barisLog()` menghasilkan metadata saja — keluaran nyata untuk PNG 1×1 bernama
  `layer.png`: `image image/png 1x1 70 B from berkas "layer.png"`.
- `sensorBase64()` menyapu apa pun yang menyerupai payload (32+ karakter base64) menjadi
  `<gambar-disenyapkan>` sebelum mencapai log, toast, atau laporan bug. Payload gambar dan
  rahasia sama-sama tidak punya tempat di log.
- Harness memeriksa ke-18 pesan galat: **tidak satu pun** memuat base64 (`L4`). Pemeriksaan
  ini yang menangkap satu pesan lama yang menggabung daftar mime dengan `/` dan tanpa
  sengaja menghasilkan deretan 35 karakter mirip-base64; teksnya diganti.

## 5. Bentuk yang dikirim ke provider

Kontrak transport adalah **string data URL** `data:<mime>;base64,<payload>` —
`split_data_url` di `src-tauri/src/adapters/mod.rs` membaca tepat format itu, jadi payload
tidak pernah di-encode ulang dan gambar tidak pernah ditulis ke disk.

| Fungsi | Hasil | Adapter Rust yang cocok |
| --- | --- | --- |
| `daftarDataUrl(gambar)` | `string[]` → `ChatMsg.images` | dipakai `all_images()` (`src-tauri/src/ai.rs:69`) |
| `kontenOpenAI(teks, gambar)` | `[{type:'text'}, {type:'image_url',…}]` | `adapters/openai.rs` |
| `blokAnthropic(g)` | `{type:'image', source:{type:'base64', media_type, data}}` | `adapters/anthropic.rs` |
| `partGemini(g)` | `{inline_data:{mime_type, data}}` | `adapters/gemini.rs` |

Bentuk-bentuk ini ada di sisi TypeScript supaya perbedaan dengan adapter Rust bisa
dibuktikan tanpa jaringan: harness membandingkan `JSON.stringify` hasilnya dengan bentuk
yang dibangun adapter (M1–M3).

## 6. Kode penolakan

`KodeTolak` — semuanya bisa ditangani UI tanpa membaca pesannya:

| Kode | Arti |
| --- | --- |
| `kosong` | tidak ada data gambar yang diserahkan |
| `mime_ditolak` | format di luar daftar putih |
| `mime_tidak_cocok` | byte tidak dikenali, atau tidak cocok dengan mime yang diklaim |
| `data_url_rusak` | bukan data URL, tanpa `;base64`, atau payload bukan base64 |
| `terlalu_besar` | melewati batas setelah (atau tanpa) diperkecil |
| `terlalu_banyak` | lebih dari 10 gambar dalam satu pesan |

## 7. Bukti

```
$ node scripts/uji-analis-gambar.mjs
UJI ANALIS GAMBAR (jalur vision Zephyr, offline)
      fixture: C:\Users\Zyrex\AppData\Local\Temp\analis-gambar-1x1.png (70 byte),
               batas 3,5 MB/gambar, maks 10 gambar
PASS  F1   fixture PNG 1x1 sah (tanda+CRC+IDAT)            70 byte, IHDR+IDAT+IEND, CRC semua cocok=true
PASS  F4   awalan cocok dengan byte magic (ekor 0x41)      3 magic dihitung dari byte, 0 salah
PASS  C1   jalur TEMPEL (data URL clipboard)               image/png 70 byte sumber=tempel
PASS  R10  tepat di batas ukuran diterima                  3500000 byte == batas 3500000
PASS  S2   jpeg 4000x3000 9 MB: 4 langkah, skala 1600/4000 skalaAwal=0.4 langkah: 0.4/0.85 0.4/0.7 0.24/0.7 0.14/0.6
PASS  N2   sumber modul bebas panggilan jaringan & console 723 baris, terlarang ketemu: tidak ada
PASS  N3   modul tanpa impor sama sekali                    0 impor (murni, tanpa dependensi)

ringkasan: 64 lulus, 0 gagal (64 pemeriksaan)
$ echo $?
0
```

Yang benar-benar diuji, bukan diklaim:

- **fixture dibuat sendiri** di TMPDIR: PNG 1x1 disusun byte-per-byte (IHDR + IDAT
  `deflateSync` + IEND), lalu **divalidasi ulang** — tanda tangan, CRC tiap chunk, IHDR
  1×1, dan IDAT yang bisa di-`inflateSync`. Gambar tiruan yang tidak pernah diperiksa
  adalah asumsi, bukan fixture.
- **tanpa jaringan, dibuktikan**: `fetch`/`XMLHttpRequest`/`WebSocket` diganti penghitung
  yang melempar **sebelum** modul diimpor; hitungannya 0 di akhir (N1), dan sumber modul
  disapu untuk `fetch(`/`invoke(`/`require(`/`console.` (N2) serta **nol** `import` (N3).
- **batas diuji di kedua sisi**: 3.500.000 byte lolos, 3.500.001 ditolak, dan kepala
  fixture-nya tetap gambar sah (R0) supaya kegagalan tidak salah dibaca sebagai kegagalan
  mime.
- **penghitungan byte** dibandingkan dengan `Buffer.length` untuk 300 ukuran × 3 bentuk
  (berpadding, tanpa padding, berbaris-baris) = 901 kasus (B1).
- **tangga perkecil** dijalankan dengan adapter palsu: berhasil di percobaan pertama,
  dan ditolak setelah 4 percobaan kalau adapternya hampir tidak mengecilkan (P1–P4).

## 8. Yang TIDAK diuji

- **`adapterKanvas()` tidak dieksekusi harness** — butuh DOM asli. Justru karena itu
  kebijakannya ada di `rencanaPerkecil` (murni, diuji), dan adapter tinggal menggambar
  persegi lalu encode ulang. Perubahan perilaku canvas hanya bisa diverifikasi di app.
- **Tidak ada panggilan provider nyata**: TIDAK DIUJI JARINGAN. Yang dibuktikan adalah
  bentuk payload yang dihasilkan sesuai yang dibaca adapter Rust, bukan bahwa provider
  menerimanya.
- Perbandingan bentuk payload dengan adapter Rust bersifat *bentuk*: kalau `openai.rs`
  berubah bentuk, harness ini tidak otomatis tahu.

## 9. Catatan integrasi

- Batas 3,5 MB / 10 gambar **sudah sama** dengan `aiStore.IMAGE_MAX_BYTES` dan
  `aiStore.MAX_IMAGES`; `K2` menguji angkanya supaya tidak menyimpang diam-diam.
- `clipboard.ts` hanya mengecilkan kalau `width > 1600` — screenshot tinggi (mis.
  1000×8000 px) tidak tersentuh karena lebarnya kecil. `ANALIS_SISI_MAKS` memakai **sisi
  terpanjang**; ini divergensi nyata, bukan salah ketik. Usulan perbaikannya ada di
  `docs/USULAN-analis-gambar.md`.
- Tiga tempat di `CliChat.tsx` dan satu di `clipboard.ts` masih memakai aturannya sendiri
  (mime dari ekstensi, `startsWith('image/')`, tanpa batas ukuran). Berkas-berkas itu
  milik lane lain, jadi usulannya ditulis di `docs/USULAN-analis-gambar.md`.
- Harness ini belum terdaftar di runner `scripts/verify*.mjs` (berkas lane lain).
