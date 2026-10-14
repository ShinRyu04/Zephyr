# Provider gagal (HTTP 429) — apa yang sudah ada, apa yang bolong

Latar: hari ini HTTP 429 (batas kecepatan provider VIP) **membunuh beberapa
proses**. Dokumen ini mencatat (a) penanganan yang **sudah ada** di app supaya
tidak dibangun ulang, (b) celah nyata, (c) desain tambalannya. **Tidak ada kode
yang diubah** — `src/lib/aiStore.ts` milik lane lain.

## 1. Yang SUDAH ada (jangan dibangun ulang)

| Bagian | Lokasi |
| --- | --- |
| Klasifikasi galat permanen vs sementara | `src/lib/aiStore.ts:2020-2051` — `401/403/400/404`, `unauthorized`, `forbidden`, `invalid request`, `cancel`, `malformed` = **permanen**; `408/429/500/502/503/504`, `timeout`, `stream terputus`, `econn/reset/enotfound/dns` = **bisa diulang** |
| Pelabelan sebab | `src/lib/aiStore.ts:2073-2078` — `provider timeout` / `provider error sementara` |
| Tangga tunggu-pulih | `src/lib/aiStore.ts:2097-2120` — `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]` (±38 dtk, 3 langkah), hitungan mundur tiap 5 dtk, menyebut nomor langkah + total, tombol Stop tetap hidup |
| Dipakai jalur agen | `src/lib/aiStore.ts:5843-5855` |
| Fallback model sekali per run | `src/lib/aiStore.ts:5876-5898` — pilih model lain di provider yang sama dulu, lalu provider lain yang sudah punya kunci; **peralihannya diumumkan** ke user |
| Jalur chat biasa | `src/lib/aiStore.ts:4756-4801` — `RETRY_CHAT = [1200, 3000]`, mengulang galat yang bisa diulang, bubble dibersihkan sebelum percobaan baru |

Kesimpulan: **di dalam app, 429 sudah ditangani** — bahkan dengan fallback model.
Premis "penanganan provider gagal belum ada" hanya benar untuk **pemanggil di
luar app**.

## 2. Celah A (lane ini) — skrip ukur tidak punya penanganan 429

Skrip harness (`scripts/cek-pengetahuan-2lapis.mjs`, dan skrip ukur lain)
memanggil provider/app tanpa klasifikasi galat. Akibat nyata hari ini: proses
mati di tengah, tidak ada kesimpulan, dan yang tersisa cuma galat mentah yang
mudah disalahartikan sebagai cacat skrip.

**Desain (boleh diimplementasikan — berkas baru di `scripts/`):**

1. `scripts/lib-429.mjs` baru:
   - `pesanRateLimit(teks)` → `true` untuk `429`, `too many requests`,
     `rate limit`, `quota`;
   - `tungguPulih(fn, { maks = 3, jeda = [4000, 12000, 22000] })` → ulangi hanya
     galat rate-limit, cetak hitungan mundur tiap langkah, hormati abort.
2. Setiap harness yang memanggil provider membungkus panggilannya dan, ketika
   tangga habis, mencetak **`TIDAK BISA DIUKUR: provider 429 setelah N percobaan`**
   lalu keluar kode `2` — bukan stack trace, bukan LULUS.
3. Hasil sementara ditulis ke berkas kerja dulu (pola yang sudah dipakai
   `scratch/`), supaya run yang mati tetap meninggalkan bukti.

Belum dipasang; usulan di atas sengaja tidak dipasang setengah jalan karena
pemakainya (`cek-pengetahuan-2lapis.mjs`) baru bisa jalan dengan CDP hidup.

## 3. Celah B (lane lain — DESAIN SAJA)

Jalur **chat biasa** (`src/lib/aiStore.ts:4756-4801`) hanya mengulang dua kali
(1.2 dtk, 3 dtk) dan **tidak** memakai tangga tunggu-pulih maupun fallback
model. Jadi 429 yang bertahan lebih dari ±4 dtk berakhir sebagai galat mentah di
gelembung jawaban, sementara jalur agen sudah pindah model sendiri.

Usulan desain: pakai ulang `tungguProviderPulihAgent()` dan
`pilihModelCadangan()` di jalur chat dengan urutan yang sama (tunggu dulu, baru
ganti model sekali per permintaan), dan tulis sebabnya di gelembung
(“provider sedang membatasi; beralih ke <model>”) — jangan diam-diam.

## 4. Yang belum bisa dipastikan (jujur)

- **Asal 429 hari ini tidak terekam.** Tidak ada log yang mencatat "429 terjadi,
  percobaan ke-N, pulih/gagal". Jadi tidak bisa dibuktikan apakah yang mati itu
  panggilan app atau panggilan skrip ukur. Usul (desain): catat tiap kejadian
  429 + hasil tangganya ke berkas log (`%APPDATA%\zephyr\logs\`) dengan satu
  baris ringkas, supaya kejadian berikutnya punya bukti.
- Belum ada uji otomatis untuk penanganan 429 (jalur app maupun skrip), karena
  semua jalur uji yang ada tidak boleh men-start/stop app dari lane ini.
