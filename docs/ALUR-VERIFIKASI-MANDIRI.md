# Alur Verifikasi Mandiri — agen Zeph memeriksa pekerjaannya sendiri

> Item **ZEPH-ALUR-VERIFIKASI-MANDIRI** · branch `feat/ai-panel-vscode-layout`
> Modul: `src/lib/alurVerifikasi.ts` (murni, tanpa impor)
> Harness: `scripts/uji-alur-verifikasi.mjs` (20 kasus, murni, app tidak perlu jalan)
> Status: modul + harness + dokumen ini SELESAI dan lulus. Integrasi ke jalur agen
> (system prompt / loop agen) belum — lihat §6, itu berkas lane lain.

---

## 1. Masalahnya

Agen yang baru mengubah berkas punya satu jalan pintas: **mengaku selesai tanpa
menjalankan apa pun**. Kalimat "sudah saya perbaiki" tidak menyimpan bukti, dan
pemeriksa yang tidak pernah dijalankan tidak pernah bisa gagal — jadi "hijau"
tanpa basis. Akibatnya kerusakan baru ketahuan berjam-jam kemudian, dari tangan
manusia.

Empat aturan menutup pintu itu, dan **semuanya ditegakkan kode, bukan disiplin
agen**:

1. **Setiap jenis perubahan punya pemeriksa.** Tidak ada perubahan "tanpa uji".
   Yang jenisnya belum dipetakan justru ditolak (§3).
2. **Keluarannya dibaca.** Kode keluar, teks keluaran, dan timeout semuanya
   dinilai — bukan diasumsikan.
3. **Merah menutup pintu.** Selama ada pemeriksa merah, putusannya tidak pernah
   `boleh selesai`.
4. **Laporan akhir diperiksa isinya.** Ringkasan tanpa perintah + keluaran nyata
   ditolak oleh pemeriksa laporan.

## 2. Peta perubahan → pemeriksa

Daftar dibaca **atas ke bawah, cocok pertama menang** (preseden sama dengan
`toolRules.ts`: urutan yang bisa dibaca seperti keputusan lebih berguna daripada
"yang paling spesifik menang"). Urutannya disengaja: aturan skrip harus dibaca
**sebelum** aturan dokumen, kalau tidak berkas uji dilabeli "dokumen" lalu lolos
tanpa pernah dijalankan.

| # | Yang berubah | Pemeriksa | cwd | Wajib |
|---|--------------|-----------|-----|-------|
| 1 | `*.ts`, `*.tsx` | `npx tsc --noEmit` | akar repo | ya |
| 2 | `*.rs` | `cargo test --lib` | `src-tauri` | ya |
| 3 | `scripts/*.mjs`, `*.cjs`, `*.js` | `node <berkas itu>` | akar repo | ya |
| 4 | `docs/**`, `*.md`, `*.txt`, `*.svg/png/jpg/gif/ico`, `*.css`, `*.html`, `*.json`, `*.lock`, `LICENSE`, `.gitignore` | — | — | **tidak** |
| 5 | sisanya (`.xyz`, `.ps1`, tanpa ekstensi, …) | **tidak ada** → putusan `ditolak` | — | — |

Tiga catatan yang menentukan benar-tidaknya peta ini:

- **`cwd` bukan hiasan.** `cargo test --lib` dijalankan dari akar repo akan
  mengeluh `could not find Cargo.toml` — merah yang tidak berarti apa-apa soal
  kode Rust. `cwd` disimpan di rencana, bukan dihafal pemanggil.
- **Perintah di-dedupe, dan itu soal kebenaran.** Sepuluh berkas `.ts` tetap satu
  `npx tsc --noEmit`: satu run tsc sudah memeriksa seluruh proyek, jadi menjalankan
  sepuluh kali tidak menambah bukti sedikit pun.
- **Baris 4 bukan izin mengaku terverifikasi.** Yang benar: *"tidak ada pemeriksa
  otomatis untuk perubahan ini"*. Dokumen tidak bisa membuat kompilasi merah.
- **Baris 5 sengaja tolak, bukan lintas.** Berkas yang jenisnya belum dipetakan
  tidak punya jalur verifikasi; menebak perintah menghasilkan hijau yang tidak
  berarti, dan mengaku selesai seolah sudah diverifikasi adalah klaim kosong.
  Menambah dukungan = menambah aturan di `ATURAN`, bukan melewati aturan.

Jalur dinormalkan lebih dulu (`normJalur`): `D:\Zephyr\scripts\uji-x.mjs` dan
`/d/zephyr/scripts/uji-x.mjs` harus sama-sama terbaca sebagai skrip uji. Agen
menulis jalur absolut setiap hari; tanpa ini, aturan `^scripts/` tidak pernah kena.

## 3. Cara keluaran dinilai

`nilaiKeluaran(perintah, kodeKeluar, keluaran)` → satu dari:

| Nilai | Kapan | Artinya untuk klaim selesai |
|-------|-------|-----------------------------|
| `hijau` | kode 0, tanpa penanda gagal | satu-satunya nilai yang membuka pintu |
| `merah` | kode ≠ 0, **atau** kode 0 tapi keluaran memuat penanda gagal | menghalangi |
| `tidak-jelas` | kode `null` (proses tak pernah selesai / timeout) | menghalangi |
| `belum-dijalankan` | perintah wajib belum ada hasilnya | menghalangi |
| `ditolak` | perintah di luar daftar izin | menghalangi + perintahnya tidak dijalankan |

Dua hal yang sengaja ketat:

- **Kode 0 tidak cukup.** Skrip pembungkus, pipa, atau perintah yang menelan
  kegagalan anaknya bisa melaporkan 0 untuk run yang gagal. Jadi keluaran ikut
  diperiksa: `error TS<angka>` (baris diagnostik tsc), baris yang **dimulai**
  `FAIL` atau `GAGAL`, `test result: FAILED`, `panicked at <…>.rs:<baris>`.
- **Penanda harus berbentuk baris milik alatnya sendiri, bukan kutipan.** Ini
  pelajaran yang dibayar saat mengerjakan item ini: versi pertama memakai
  `/\berror TS\d+\b/`, dan harness `scripts/uji-alur-verifikasi.mjs` yang lulus
  19/19 **dinilai merah** karena detail kasus ujinya sendiri mengutip teks
  `error TS2322`. Agen yang mempercayai itu akan berputar memperbaiki yang sudah
  hijau sampai batas percobaan habis. Karena itu setiap penanda kini menuntut
  bentuk yang hanya bisa keluar dari alat yang gagal:
  tsc `berkas(12,7): error TS2322:` / `berkas:12:7 - error TS2322:` mulai kolom 0,
  `GAGAL`/`FAIL` mulai kolom 0, `test result: FAILED`, `panicked at ….rs:12`.
  Kasus **V18** menjaga ini agar tidak mundur; **V19** menjaga sisi sebaliknya
  (run ber-kode-0 yang benar-benar memuat `GAGAL` tetap merah).
- **Timeout bukan hijau dan bukan merah — melainkan "tidak bisa dinilai"**, dan
  itu tetap menghalangi. Proses yang tidak pernah selesai tidak membuktikan apa pun.
- **Daftar izin perintah.** Modul menyusun perintah dari nama berkas yang bisa
  datang dari mana saja; tanpa daftar izin, berkas bernama
  `scripts/x.mjs; rm -rf /` menghasilkan perintah yang "terlihat benar".
  Perintah di luar `PERINTAH_TETAP` + `POLA_PERINTAH_DINAMIS` → `ditolak`.
- **Laporan menyebut berkasnya, bukan cuma "tsc merah".** `berkasBermasalah()`
  (dan `putusan.berkasMerah`) mengambil nama berkas dari baris diagnostik. Di
  repo ini beberapa lane mengedit bersamaan dan `npx tsc --noEmit` itu repo-wide:
  merah bisa datang dari berkas yang **bukan** milik pelapor. Aturannya tetap
  sama (pohon merah = jangan mengaku selesai), tapi manusia yang menerima laporan
  tidak perlu menebak siapa yang harus berhenti.

## 4. Batas percobaan: **3**

`BATAS_PERCOBAAN = 3` — angka yang sama dengan aturan kerja repo ("3 percobaan
gagal → stop & lapor"). Di sini angkanya **ditegakkan modul**, bukan diserahkan
pada ingatan agen:

| Kondisi | Putusan |
|---------|---------|
| semua perintah wajib hijau, tidak ada masalah lain | `boleh selesai` |
| ada yang merah/tak-jelas/belum jalan, percobaan jalan ke-1 atau ke-2 | `belum selesai` (perbaiki dulu) |
| perintah yang sama masih belum hijau dan sudah **3×** dijalankan | `berhenti + lapor` |
| jenis berkas belum dipetakan, atau perintah di luar izin | `ditolak` |

Percobaan dihitung **per perintah** dan yang dinilai adalah **hasil terakhir**.
Agen yang merah 2× lalu hijau → `boleh selesai`; yang merah 3× → tidak boleh
percobaan ke-4, wajib berhenti dan lapor beserta keluaran nyatanya. Status
terberat menang saat beberapa masalah muncul bersamaan (`ditolak` > `berhenti + lapor`
> `belum selesai` > `boleh selesai`).

## 5. Laporan akhir

`validasiLaporan(laporan, hasil)` menuntut, **untuk setiap** hasil jalan:

1. perintahnya disebut apa adanya;
2. potongan keluaran nyatanya ada (baris pertama yang tidak kosong, ≤60 karakter);
3. kode keluarnya tertulis (`kode 2`, `kode 0`, atau `kode timeout`).

Tiga hal itu persis yang hilang dari laporan karangan, dan yang membuat pembaca
bisa memeriksa ulang tanpa memercayai penulisnya. `laporanAkhir(putusan, hasil)`
membangun laporan yang lolos pemeriksaannya sendiri (dengan keluaran apa adanya,
dipotong pada 8000 karakter) — jadi tidak ada alasan menulis laporan dari nol
yang lalu ditolak.

Kalau laporan akhir diminta tapi tidak lolos, putusannya **tidak** `boleh selesai`,
dan `laporanSiap: false`.

## 6. Yang belum: integrasi (berkas lane lain)

Modul ini tidak diimpor siapa pun di jalur agen — sengaja, karena
`src/lib/systemPrompt.ts` dan `src/lib/zephyrTools/**` dipegang lane lain. Bentuk
integrasinya, saat lane pemilik siap:

1. **Sesudah sekumpulan perubahan berkas**, kumpulkan jalurnya + hasil jalan agar
   ada, lalu panggil `putuskan({ jalur, hasil })`.
2. Selama `putusan.bolehSelesai === false`, **jangan** izinkan agen menutup
   giliran dengan "selesai": kembalikan `putusan.alasan` + daftar `putusan.perintah`
   sebagai instruksi lanjutan.
3. Saat `status === 'berhenti + lapor'` / `'ditolak'`, hentikan dan kirim
   `laporanAkhir(putusan, hasil)` ke pengguna, bukan mencoba lagi.
4. Teks aturan untuk system prompt (kalau lane itu mau) cukup satu paragraf yang
   menyebut empat aturan di §1 + angka `BATAS_PERCOBAAN`.

Permintaan perubahan ke berkas lane lain ditulis di `docs/USULAN-alur-verifikasi.md`
(bukan di sini).

## 7. Cara menjalankan buktinya

```bash
cd D:/Zephyr
node scripts/uji-alur-verifikasi.mjs   # 20 kasus, exit 0 = lulus, 1 = ada yang gagal
npx tsc --noEmit                       # 0 galat dari src/lib/alurVerifikasi.ts
```

Kasus yang diuji (tiap cabang keputusan punya wakilnya):

| Kasus | Yang dibuktikan |
|-------|-----------------|
| V1 | ubah `.ts` → wajib `npx tsc --noEmit` |
| V2 | ubah `.rs` → wajib `cargo test --lib`, `cwd=src-tauri` |
| V3 | ubah skrip uji → wajib menjalankan skrip **itu** |
| V4 | ubah `docs/**` → tidak wajib apa pun |
| V5 | campur `.ts`/`.tsx`/`.rs`/skrip/docs → tsc sekali (dedupe), urutan tetap, dokumen tidak jadi perintah |
| V6 | jalur absolut Windows **dan** MSYS tetap terbaca jenisnya |
| V7 | kode 1 → `belum selesai` |
| V8 | kode 0 tapi keluaran memuat baris diagnostik tsc → tetap merah |
| V18 | run **hijau** yang hanya mengutip penanda gagal → tetap hijau (regresi) |
| V19 | run kode 0 yang benar-benar memuat baris `GAGAL` / `test result: FAILED` → tetap merah |
| V20 | merah menyebut berkas siapa (dua bentuk keluaran tsc, dedupe + urut) |
| V9 | kode `null` (timeout) → `tidak-jelas`, tetap menghalangi |
| V10 | perintah wajib belum dijalankan → `belum selesai` |
| V11 | tiga perintah hijau → `boleh selesai` |
| V12 | merah ke-2 dari batas 3 → masih `belum selesai` |
| V13 | merah ke-3 → `berhenti + lapor` |
| V14 | perintah di luar daftar izin (`npm run build`) → `ditolak` |
| V15 | berkas `.xyz` (jenis belum dipetakan) → `ditolak` |
| V16 | laporan "sudah saya perbaiki" tanpa keluaran → ditolak; `laporanAkhir()` → diterima |
| V17 | `laporanAkhir()` memuat perintah + keluaran apa adanya + kode keluar |

Harness ini juga dibuktikan **bisa gagal**: salinan mutannya (harapan dirusak
sengaja) keluar `1` dengan `1/3 lulus`, jadi `exit 0` di atas bukan kebetulan
harness yang tidak pernah merah.

## 8. Modul atas data nyata (bukan cuma fixture)

Menjalankan modul atas perubahan item ini sendiri (`src/lib/alurVerifikasi.ts`,
`scripts/uji-alur-verifikasi.mjs`, `docs/ALUR-VERIFIKASI-MANDIRI.md`) dengan
menjalankan perintahnya sungguhan:

| Perintah | kode | nilai | putusan |
|----------|------|-------|---------|
| `npx tsc --noEmit` | 0 | hijau | — |
| `node scripts/uji-alur-verifikasi.mjs` | 0 (`== 20/20 lulus ==`) | hijau | `boleh selesai` |
| `… dokumen` | — | — | tidak wajib diperiksa |

`laporanAkhir()` yang dihasilkan lolos `validasiLaporan()` sendiri
(`{ok:true, kurang:[]}`), dan `putuskan(ubah, {laporan})` tetap `boleh selesai`.

Satu kejadian nyata yang layak dicatat: di tengah pengerjaan, `npx tsc --noEmit`
**sempat merah** karena `src/lib/zephyrDokumen.ts` (berkas lane lain yang sedang
diedit) memuat galat `TS2323/TS2393`, lalu hijau lagi setelah lane itu
membereskan. Modul menilai merah saat itu — benar, karena pohon merah memang
belum boleh diklaim selesai — dan `berkasMerah` menyebut berkas yang salah, bukan
berkas yang diubah pelapor.
