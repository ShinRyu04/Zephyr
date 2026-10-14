# Batas ukuran tulis & batas jumlah berkas ganti + jadwal sekali-jalan

Dokumen ini menutup tiga celah sisi Rust dari `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`.
Isinya: angka batas yang dipilih, **alasan angkanya** (dari ukuran berkas NYATA di
repo ini, bukan tebakan), daftar uji yang menjaga perilakunya, usulan tambalan sisi
TypeScript (tidak dikerjakan di sini - `src/lib/**` bukan milik lane ini), dan
rancangan jadwal sekali-jalan + pelaporan jadwal terlewat.

---

## 1. Batas ukuran tulisan berkas — `MAKS_TULIS_BYTE`

**Nilai: 67.108.864 byte = 64 MiB.** (`src-tauri/src/fs_utils.rs`)

Dipasang di jalur tool, bukan di semua `std::fs::write` internal:

| Jalur | Berkas | Kapan diperiksa |
| --- | --- | --- |
| `fs_write` → `tulis_isi` | `fs_utils.rs` | panjang ISI (sebelum apa pun disentuh) **dan** byte hasil encode (sebelum `std::fs::write`) |
| `fs_create_file` | `fs_utils.rs` | byte hasil encode, sebelum `std::fs::write` |

Penulis internal (jurnal, snapshot riwayat, `cron.json`, log) memakai
`std::fs::write` langsung dan **tidak** terkena batas - memang tidak boleh, karena
yang dicegah adalah satu panggilan agen yang menulis keluaran tak terbatas.

### Kenapa 64 MiB, bukan 8 atau 32 MiB

Ukuran berkas nyata terbesar di repo ini (diukur `ls -lS` atas berkas yang dilacak
git):

* `src-tauri/assets/cc-catalog.json` — **6.225.418 byte (5,94 MB)**
* `src/lib/i18n-extra.ts` — **1.711.491 byte (1,63 MB)**
* `src/lib/fileIconMap.ts` — 928.374 byte (0,89 MB)

Batas 64 MiB memberi ruang **≈10,8×** di atas berkas nyata terbesar, jadi tidak ada
berkas sah di repo ini yang bisa kena, dan menulis ulang berkas besar hasil
pembacaan pun aman. Yang lebih penting: **batas baca sudah 32 MB**
(`MAX_READ_BYTES`), dan berkas apa pun yang bisa DIBACA harus bisa DITULIS KEMBALI -
kalau batas tulis lebih kecil dari batas baca, ada berkas yang "bisa dibuka lalu
disimpan" tapi gagal saat disimpan, dan itu membuat putar-balik (buka → simpan
tanpa perubahan) rusak.

64 MiB = 2 × 32 MB dipilih karena encoding akhir baris bisa menambah byte: berkas
32 MB yang seluruh barisnya LF dapat mendekati 2× ukuran setelah dikonversi ke CRLF.
Justru itu pemeriksaannya **dua kali** - pada panjang isi dan pada byte hasil encode -
supaya konversi itu tidak bisa menyelinap melewati batas.

### Bentuk galat (contoh nyata)

```
InvalidInput: isi terlalu besar untuk ditulis (67108865 byte, batas 67108864 byte = 64 MB):
D:/Zephyr/ws/besar.txt - pecah jadi beberapa berkas atau tulis sebagian
```

Pesannya menyebut **angka yang diminta**, **batasnya**, dan **berkasnya**. Berkas
tidak disentuh sama sekali (pemeriksaan terjadi sebelum `std::fs::write`), jadi
percobaan yang ditolak tidak meninggalkan berkas setengah jadi.

### Uji yang menjaga (semua di `src-tauri/src/fs_utils.rs`, modul `uji_batas_tulis`)

| Uji | Yang dibuktikan |
| --- | --- |
| `penjaga_ukuran_batas_bawah_atas` | 0, `batas-1`, `batas` lolos; `batas+1` ditolak dengan `InvalidInput` dan pesan memuat kedua angka + nama berkas |
| `tulis_di_bawah_batas_sukses` | tulis normal → isi di disk sama persis |
| `tulis_tepat_di_batas_sukses` | berkas tepat sebesar batas → sukses, ukuran di disk = batas |
| `tulis_di_atas_batas_ditolak_dan_berkas_tidak_berubah` | di atas batas → galat, dan **isi lama di disk tetap utuh** (dibaca ulang) |
| `penolakan_encode_dihitung_pada_byte_hasil_encode` | isi yang SAMA: `lf` (tepat di batas) sukses, `crlf` (batas + jumlah baris) ditolak dan tidak ada berkas tertulis |

---

## 2. Batas jumlah berkas penggantian lintas berkas — `MAKS_BERKAS_GANTI`

**Nilai: 200 berkas.** (`src-tauri/src/search.rs`, diperiksa di
`ganti_lintas_berkas`, yaitu badan `search_replace`.)

Daftar yang lebih panjang dari batas **ditolak bulat** (`InvalidInput`) sebelum satu
berkas pun dibaca atau ditulis - jadi tidak ada penggantian sebagian yang
setengah jalan. Di bawah batas, hasilnya **tidak berubah sama sekali**: tidak ada
berkas yang disaring, dilewati, atau dipotong diam-diam.

### Kenapa 200

Angka nyata repo ini:

* berkas Rust di `src-tauri/src`: **76**
* berkas (semua jenis) di `src/`: **335**
* berkas yang memuat `ZephyrError` (seluruh repo, Rust): **55**
* berkas `.md`: 13
* penyisir di sisi TS mengumpulkan sampai **5000** berkas (`listWorkspaceFiles(5000)`, `src/lib/zephyrTools/builtins.ts:2361`) - jauh di atas batas mana pun yang masuk akal, jadi tanpa batas satu glob yang salah bisa menyentuh hampir seluruh repo dalam satu panggilan.

Sapuan serentak yang wajar (ganti nama satu simbol di seluruh backend) ada di
puluhan berkas: 76 berkas Rust, atau 55 berkas yang memuat simbol itu. Batas 200
memberi ruang **≈2,6×** di atas sapuan wajar terbesar, tetapi tetap menangkap
sapuan yang memang terlalu luas (335 berkas di `src/`).

### Bentuk galat (contoh nyata)

```
InvalidInput: penggantian lintas berkas menerima paling banyak 200 berkas, daftar ini 201 berkas -
persempit glob/root atau pecah jadi beberapa panggilan
```

### Uji yang menjaga (`src-tauri/src/search.rs`, modul `tests`)

| Uji | Yang dibuktikan |
| --- | --- |
| `ganti_ditolak_saat_daftar_melebihi_batas` | 201 berkas → `InvalidInput`, pesan memuat 200 dan 201, dan **semua berkas dibaca ulang: tidak satu pun berubah** |
| `ganti_tepat_di_batas_tetap_mengganti_seperti_biasa` | tepat 200 berkas → 200 hasil, semuanya tergantikan di disk (`halo dunia` → `hai dunia`) |
| `ganti_di_bawah_batas_tidak_berubah_hasilnya` | 3 berkas → 3 hasil; berkas tanpa kecocokan tetap dilaporkan dengan `jumlah = 0` dan tanpa galat (perilaku lama utuh) |

### Usulan tambalan sisi TypeScript (BELUM dikerjakan — `src/lib/**` milik lane lain)

Tujuannya: pengguna bisa mengatur batasnya sendiri, dan penolakan Rust tidak lagi
muncul sebagai kejutan di ujung jalan. Tiga titik, kecil-kecil:

1. **`src/lib/zephyrTools/builtins.ts:924-934`** — tambah parameter pada
   `spec.parameters.properties` milik tool `replace_in_files`:

   ```ts
   maksBerkas: {
     type: ['number', 'string'],
     description: 'Batas jumlah berkas yang boleh disentuh satu panggilan (bawaan 200, maksimum 2000).',
   },
   ```

   dan jangan masukkan ke `required` (harus tetap opsional).

2. **`src/lib/zephyrTools/builtins.ts:963-969`** — sebelum `cmd.searchReplace(...)`,
   saring/potong daftar secara eksplisit dan katakan dengan jujur bila dipotong:

   ```ts
   const batas = Math.min(Math.max(Number(a.maksBerkas ?? 200) || 200, 1), 2000);
   const berkas = (await kumpulkanBerkas(opsi)).slice(0, batas);
   ```

   Kalau pengguna ingin sisa daftarnya tetap diproses, jalankan berkelompok:

   ```ts
   const kelompok = [];
   for (let i = 0; i < semua.length; i += batas) kelompok.push(semua.slice(i, i + batas));
   ```

   (bentuk mana pun boleh, asal **daftar yang dikirim tidak pernah melebihi batas** -
   itulah satu-satunya hal yang bisa dirimu jamin; Rust tetap menolak di atas 200).

3. **`src/lib/commands.ts:1169`** — di sini `search_replace` dipanggil. Tidak perlu
   diubah kalau batas sudah dijaga di langkah 2. Bila mau sabuk pengaman ganda,
   potong `files` di sini juga dan biarkan galat `InvalidInput` dari Rust mengalir
   apa adanya (pesannya sudah menyebut angka), lalu teruskan ke hasil tool sebagai
   teks galat, jangan ditelan.

Aturan yang sebaiknya dipertahankan: batas TS boleh **lebih kecil** dari 200 (untuk
hemat waktu/konteks), tetapi tidak boleh lebih besar - Rust tetap menolak di atas 200,
dan pengguna akan melihat galat yang membingungkan kalau sisi TS menjanjikan lebih.

---

## 3. Jadwal sekali-jalan + pelaporan jadwal terlewat

`src-tauri/src/cron.rs`. Sebelumnya cron hanya mengenal `every_minutes` dan
`at_hour` (berulang), dan timer 30 detik hanya hidup selagi aplikasi hidup - jadwal
yang waktunya tiba saat aplikasi mati hilang senyap.

### Yang ditambahkan

| Bidang baru di `CronJob` | Arti |
| --- | --- |
| `sekali_at: Option<u64>` | target tunggal (epoch detik). Saling meniadakan dengan `every_minutes`/`at_hour` |
| `selesai: bool` | sudah dijalankan (atau sudah dilaporkan terlewat) → **tidak pernah** dijalankan lagi |
| `terlewat: Option<u64>` | jejak: target yang terlewat karena aplikasi tidak hidup saat waktunya tiba |

Ketiganya ber-`#[serde(default)]`. Ini bukan hiasan: tanpa itu `cron.json` lama
gagal di-parse dan `muat()` mengembalikan daftar KOSONG - semua jadwal pengguna
hilang senyap saat aplikasi diperbarui.

### Aturan penilaian (`CronJob::status(sekarang, sesi_mulai)`)

`sesi_mulai` = epoch detik saat PROSES INI pertama hidup
(`epoch_sekarang() - AppState::uptime_ms()/1000`). Itulah pembeda antara "timer di
sesi ini melewatkannya" (tidak mungkin: timer mengecek `target <= sekarang`) dan
"aplikasi memang tidak hidup saat waktunya tiba".

* `enabled = false` → `Belum` (nonaktif menang atas semuanya).
* `sekali_at = None` (berulang) → perilakunya **persis** seperti sebelumnya:
  `jatuh_tempo() <= sekarang` → `Siap`, selain itu `Belum`.
* sekali-jalan, `selesai = true` → `Selesai`. Titik. Karena itu jadwal
  sekali-jalan tidak pernah dijalankan dua kali, walau timer kebetulan mengeceknya
  berkali-kali dalam detik yang sama.
* sekali-jalan, target > sekarang → `Belum`.
* sekali-jalan, target < `sesi_mulai` → **`Terlewat`** (aplikasi mati saat waktunya
  tiba). Tidak dijalankan terlambat.
* sekali-jalan, `sesi_mulai <= target <= sekarang` → `Siap` (jatuh saat sesi ini
  hidup; dijalankan).

### Pemulihan saat aplikasi hidup lagi

`mulai_timer` memanggil `pulihkan_jadwal_terlewat(&app)` **sebelum** thread timer
dibuat, jadi kebijakan "terlambat → dijalankan" tidak pernah aktif walau sekejap.
Pemulihan itu:

1. menandai tiap jadwal terlewat dengan `terlewat = target` dan **menyimpannya ke
   `cron.json`** (jejaknya bertahan, bukan cuma log yang menguap),
2. mengembalikan daftarnya, yang lalu `tracing::warn!` dan di-`emit` sebagai
   peristiwa `cron-missed` ke UI,
3. aman dipanggil berkali-kali: panggilan kedua mengembalikan daftar kosong (tidak
   ada laporan ganda).

Job yang terlewat **tidak dijalankan**. Konsekuensinya job kehilangan satu kali
jalan, tetapi tidak ada perintah pengguna yang nomplok di waktu yang tidak
diinginkan pengguna; jejaknya tetap ada di `cron.json`/daftar jadwal dan bisa
dijalankan ulang dengan sengaja.

`cron_create` menerima satu parameter opsional baru `sekali_at` (bawaan `null`);
pemanggil lama tidak perlu berubah.

### Uji yang menjaga (`src-tauri/src/cron.rs`, modul `tests`)

| Uji | Yang dibuktikan |
| --- | --- |
| `status_sekali_jalan_deterministik` | keempat keadaan pada waktu yang ditulis eksplisit: belum / siap (juga saat target == `sesi_mulai`) / terlewat / selesai, plus nonaktif menang |
| `validasi_sekali_jalan_saling_meniadakan_dengan_berulang` | `sekali_at` + `every_minutes` ditolak; `sekali_at` + `at_hour` ditolak; `sekali_at = 0` ditolak; `sekali_at` sendiri lolos |
| `sekali_jalan_tidak_pernah_jalan_dua_kali` | **(a)** jatuh tempo sekali → `tandai_jalan` menulis `selesai = true` ke disk → tiga kali `jatuh_tempo` berikutnya kosong |
| `jadwal_terlewat_dilaporkan_bukan_dijalankan_terlambat` | **(b)** `jatuh_tempo` kosong (tidak dijalankan terlambat); `lapor_terlewat` mengembalikan 1 job dengan `terlewat = target`; jejaknya ada di `cron.json`; laporan kedua kosong |
| `terlewat_dan_refresh_daftar_tidak_menghidupkannya_kembali` | **(b)** sesudah dilaporkan, timer berkala tetap tidak menjalankannya; `cron.json` lama (tanpa bidang baru) tetap termuat utuh |
| `jadwal_berulang_lama_tidak_berubah_perilakunya` | **(c)** `last_run` lama tetap jatuh tempo, `last_run` baru tidak, harian tetap valid dan bukan sekali-jalan, tidak ada jadwal berulang yang dilaporkan terlewat |
| `nonaktif_tidak_pernah_jatuh_tempo`, `interval_dihitung_dari_jalan_terakhir`, `interval_belum_waktunya`, `harian_tanpa_jam_tidak_valid`, `harian_jam_di_luar_rentang_ditolak`, `jatuh_tempo_harian_di_masa_depan` | uji lama, tetap hijau (tidak ada regresi) |

### Sisa yang belum ditutup (di luar wilayah lane ini)

* Jadwal terlewat hanya dilaporkan saat aplikasi hidup lagi; tidak ada notifikasi
  saat aplikasi mati (memang mustahil tanpa proses terpisah).
* Sisi TS (`src/lib/**`) belum mengekspos `sekali_at`/`terlewat` di UI; `cron_list`
  sudah mengembalikan ketiga bidang itu, jadi UI tinggal membacanya.
