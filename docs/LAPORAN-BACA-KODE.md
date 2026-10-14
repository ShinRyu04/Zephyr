# LAPORAN BACA KODE SENDIRI (`ZEPH-BACA-KODE-SENDIRI`, sisa `ai-tahu-100-8`)

Tanggal uji: 2026-10-14 · Repo: `D:\Zephyr` · Node: `node scripts/uji-baca-kode.mjs`
Vonis: **LULUS — 49/49 diperiksa, exit 0** · `node node_modules/typescript/lib/tsc.js --noEmit` → **0 galat**
Harness lain (tetap hijau): `node scripts/uji-peta-kode.mjs` → 24/24 LULUS · `node scripts/uji-tahu-100p.mjs` → 59/59 LULUS
Harness CDP (:9223) **tidak** dijalankan (lane lain sedang menyunting `src/**`).

## 1. Apa yang dibangun

`src/lib/bacaKode.ts` (746 baris) — pembaca ISI berkas kode sebagai **potongan baris**, bukan penunjuk jalur.
Harness `scripts/uji-baca-kode.mjs` (885 baris) menguji 49 hal.
Sebelumnya Zeph bisa menyebut `src/components/shell/ActivityBar.tsx:371` dari peta kode tapi tidak bisa
mengutip isinya, jadi jawaban "cara kerja X" berhenti di tingkat daftar. Sekarang:

```
[baca_kode v1] src/components/shell/ActivityBar.tsx:360-365 (6 dari 370 baris; 15.783 B; tag dfb19ad3)
  360| // ...
```

Bisa lewat **rentang baris** (`dari`/`sampai`) atau lewat **simbol** (`simbol: "normalJalur"` → baris definisi
`532`, jendela `526-572`).

## 2. Angka nyata (dari keluaran harness, bukan perkiraan)

| Angka | Nilai terukur |
|---|---|
| Berkas repo saat uji | **2.335** berkas (angka bergerak: lane lain menyunting `src/**` saat uji) |
| Berkas yang LOLOS kebijakan baca hari ini | **2.039** (87,3 %) |
| Ukuran potongan 11 baris (contoh A) | **555 karakter** (5.500 B berkas asal) |
| Waktu satu pembacaan 11 baris | **7-9 ms** (satu panggilan jembatan, tanpa proses baru) |
| Berkas `konteksRepo.ts` (1.340 baris) dibaca 1..100000 | **95 baris** dikirim, **6.100 karakter**, sebab potong `batas-karakter` |
| 300 baris pendek diminta 1..100000 | **tepat 120 baris** (1-120 dari 300), sebab `batas-baris` |
| Batas yang ditegakkan | 120 baris/pembacaan · berkas ≤ 524.288 B (512 KiB) · 400 karakter/baris · 6.000 karakter/pembacaan · **1 berkas/panggilan** · 12 pembacaan/sesi |
| `ActivityBar.tsx` | 370 baris, bisa dikutip seluruhnya (A6: contoh berkas kecil 90 baris dibaca 1-90 dari 90) |
| Determinisme | 2× panggilan sama = **564 byte identik** (tag isi `939b5e26`), murni dan lewat 2 jembatan berbeda |
| Nol tulis | objek jembatan hanya menyentuh **3 nama**: `{fsRead, fsStat, realpath}`; 20 `fsRead` nyata, **0** pemanggilan tulis |
| Penolakan | 23 bentuk jalur terlarang + 24 nama/folder rahasia, **0** pemanggilan jembatan (ditolak sebelum disk disentuh) |

## 3. Delapan syarat bukti tambahan — di mana diuji

| # | Syarat | Kasus di harness | Hasil nyata |
|---|---|---|---|
| 1 | tolak `..`, absolut Windows (`C:/...`), UNC (`\\server\share`) | `C1` (23 bentuk: `..`, `../..`, `C:/Windows/win.ini`, `C:\...`, `//server/share`, `\\server\share`, `%2e%2e/`, byte kontrol, array) | 23 bentuk ditolak, 0 pemanggilan jembatan |
| 2 | daftar rahasia **dipinjam** dari `src/lib/agentGuard.ts` (barisnya disebut), `.env`/`*.key`/`*.pem` **tidak pernah dibaca** | `C2`, `C2b`, `F1`, `F2`, `F3`, `F3b` | `POLA_RAHASIA` `agentGuard.ts:80-103` (22 pola), `DIR_TERPROTEKSI` `:115-141` (25 entri), dipakai ulang lewat `konteksRepo.ts:58` impor → `:223 POLA_RAHASIA_EFEKTIF` → `:609 alasanBlokirRahasia`; 24 nama ditolak, `fsRead=0`; modul sendiri **0** regex rahasia |
| 3 | berkas besar dipotong di batas BARIS, angka nyata (awal/akhir/total) dicetak | `B1`, `B1b`, `B6` | `baris 1-95 dari 1340` (sebab `batas-karakter`), `1-120 dari 300` (sebab `batas-baris`), 52 baris = 6.115 karakter |
| 4 | berkas biner tidak dipaksa jadi teks | `C4`, `C5` | `.png` nyata ditolak **sebelum** disk dibaca (`fsRead=0`); biner ber-NUL yang menyamar `.ts` ditolak di lapisan ISI (`isi bukan teks (byte NUL)`) |
| 5 | keluaran tidak pernah memuat nilai kunci/rahasia | `D5b`, `D5`, `D6` | `D5b` = uji negatif keras: `.env` + `server.pem` **benar-benar ada di disk dan benar-benar berisi nilai berbentuk kunci** (`sk-proj-...`, `PRIVATE KEY`) → ditolak karena NAMA, `fsRead=0`, nilai tidak muncul di 160 keluaran; `D5` 160 keluaran bersih dari pola penugasan rahasia; `D6` 0 akar repo/folder rumah yang modul tahu sendiri |
| 6 | batas jumlah berkas/panggilan ditegakkan (angkanya disebut) | `B4`, `B4b`, `E5` | `BATAS_BERKAS_PER_PANGGILAN = 1`; skema tool `berkas` bertipe `string` tunggal; daftar berkas ditolak dengan `hanya 1 berkas per panggilan: kirim satu jalur string, bukan daftar.` |
| 7 | determinisme: berkas+rentang sama = byte-identik | `A4` | 564 byte identik, 2× murni + 2× lewat jembatan berbeda |
| 8 | tidak ada jalur yang MENULIS | `D3`, `D1`, `D4` | Proxy mencatat setiap properti jembatan yang disentuh → hanya `realpath/fsStat/fsRead`; pindai statis 6 pola tulis = 0 kemunculan; sha1 berkas yang dibaca identik sebelum/sesudah |

Kasus lain yang ikut diuji: `A0-A6` (kasus `ActivityBar.tsx` nyata, baris dicocokkan ulang ke disk, simbol→jendela),
`B2/B2b` (512 KiB), `B3` (12 pembacaan lalu ke-13 ditolak), `B5` (baris 5.000 char dipangkas ke 400),
`C3/C3b` (junction keluar repo ditolak, `fsRead=0`), `C6-C9`, `E1-E5` (lapisan tool), `G1`.

## 4. Bukti tidak menduplikasi — fungsi yang SUDAH ada + barisnya

Harness `G1` menghitung **85 ekspor di 5 berkas** yang sudah ada; modul baru hanya memakai ulang, tidak menyalin.

- `src/lib/konteksRepo.ts` — `normalJalur:532`, `bahasaDariJalur:552`, `diabaikanStruktur:589`,
  `alasanBlokirRahasia:609`, `skorPrioritasBerkas:890`, `bangunKonteksRepo:1143`, `pindaiKonteksRepo:1247`,
  `PerintahKonteksRepo:1212`, `POLA_RAHASIA_EFEKTIF:223` (35 ekspor). **Bedanya**: modul ini hanya memakai
  *kebijakan* dari sana (jalur + rahasia); ia tidak memindai struktur repo, dan tidak pernah mengembalikan isi baris.
- `src/lib/zephyrCari.ts` — `pecahKueri:148`, `namaDalamKueri:179`, `kataTakDikenal:238`, `cariFakta:358`,
  `hitungCocok:410`, `formatHasil:425`, `cariKode:439`, `suntikanIndeks:513`, `petaIndeks:476`,
  batas `BATAS_HASIL_BAWAAN:64` / `MAKS:66` / `BATAS_KARAKTER_HASIL:68` / `BATAS_KARAKTER_SUNTIK:453` (20 ekspor).
  **Bedanya**: `zephyrCari` memetakan *kueri → entri* (nama berkas + baris); ia tidak pernah membaca isi berkas.
  `cariKode:439` mengembalikan entri peta, bukan potongan baris — itu tepat gejala yang item ini tutup.
- `src/lib/alurVerifikasi.ts` — `perintahDiizinkan:90`, `normJalur:145`, `periksaBerkas:229`, `rencanaVerifikasi:282`,
  `nilaiKeluaran:319`, `berkasBermasalah:349`, `putuskan:416`, `validasiLaporan:560`, `laporanAkhir:589`,
  batas `BATAS_PERCOBAAN:70` / `PERINTAH_TETAP:77` / `POLA_PERINTAH_DINAMIS:80` (20 ekspor).
  **Bedanya**: ini menilai *lulus/gagal* dari keluaran perintah; bukan pembaca berkas.
- `src/lib/agentGuard.ts` — `bentukBanding:44`, `POLA_RAHASIA:80` (80-103), `DIR_TERPROTEKSI:115` (115-141),
  `AWALAN_TOLAK_TULIS:147`, `HasilAman:169`, `periksaBaca:180`, `periksaTulis:214`, `periksaPerintahShell:272`
  (7 ekspor). **Dipakai ulang, tidak disalin**: modul baru memanggil `alasanBlokirRahasia` (yang memakai
  `POLA_RAHASIA` + `DIR_TERPROTEKSI` yang sama) untuk nama berkas **dan** untuk setiap awalan folder jalur.
- `src/lib/zephyrIndeks.ts` — 3 ekspor (label peta kode `kode`, `EntriKode`). Dipakai sebagai sumber bukti bahwa
  `ActivityBar.tsx` memang entri peta kode yang nyata (kasus `A0`), bukan contoh karangan.

## 5. Catatan keamanan yang perlu diketahui (temuan, bukan cacat yang disembunyikan)

- **Selisih dengan `periksaBaca()` dibedah, bukan ditutupi** (kasus `F3b`). `agentGuard.ts:180 periksaBaca` mencocokkan
  `${cmp}/".includes(dir)` sehingga folder repo biasa bernama `etc/`, `proc/`, `sys/` ikut terblokir; `konteksRepo.ts`
  sengaja **tidak** mengadopsi vonis itu untuk jalur relatif (lihat catatan di dalam `alasanBlokirRahasia:609`).
  Harness memeriksa 49 nama: 0 pelanggaran pada gerbang efektif, dan 3 selisih (`private/etc/x.txt`,
  `private/var/db/x.txt`, `private/var/root/x.txt`) semuanya kategori folder sistem absolut itu — tidak ada selisih
  tak terduga. Pilihan sadar: ikut kebijakan efektif, supaya berkas repo yang sah tidak hilang tanpa sebab.
- **Blokir rahasia berlapis**: (a) nama berkas lewat gerbang bersama; (b) **setiap awalan folder** (mencegah
  `src/.env/x.ts`, nama berkasnya `.ts` sah tapi ada DI DALAM folder `.env`); (c) bentuk mentah ditolak sebelum
  normalisasi (UNC, leading `/`, `C:/`, byte kontrol, array).
- **Biner dua lapis**: daftar putih ekstensi (23 ekstensi + 4 nama tanpa ekstensi) menolak `.png` sebelum disk dibaca,
  lalu detektor isi (`apakahBiner`: byte NUL / banjir U+FFFD) menangkap biner yang menyamar berekstensi teks.
- **Yang belum tersambung ke aplikasi**: registrasi tool + jembatan `fs_read`/`fs_stat`/`realpath` dan penentuan
  akar repo runtime **belum dipasang** — lihat `docs/USULAN-BACA-KODE.md`. Modulnya sudah fail-closed: tanpa jembatan
  ia menjawab `baca_kode belum tersambung: jembatan berkas belum dipasang. Tidak menebak akar repo.` (kasus `E2`).

## 6. Cara menjalankan ulang

```bash
cd /d/Zephyr
node scripts/uji-baca-kode.mjs          # 49/49 LULUS, exit 0
node node_modules/typescript/lib/tsc.js --noEmit   # 0 galat
node scripts/uji-peta-kode.mjs          # 24/24 LULUS
node scripts/uji-tahu-100p.mjs          # 59/59 LULUS
```
