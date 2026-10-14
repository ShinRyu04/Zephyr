# Penambalan celah `konteksRepo.ts` (C-1 … C-5)

Sumber celah: `docs/USULAN-KONTEKS-REPO-CELAH.md` (uji adversarial `scripts/uji-konteks-repo-adv.mjs`, 57 kasus).
Semua tambalan dikerjakan di modul produk `src/lib/konteksRepo.ts` (tanpa pemilik lane saat itu).

## Bukti sesudah tambalan

| Gerbang | Sebelum | Sesudah |
| --- | --- | --- |
| `node scripts/uji-konteks-repo-adv.mjs` (ketat) | 43/57 (14 celah) | **57/57, CELAH TERBUKA (0)** |
| `node scripts/cek-konteks-repo.mjs` (gate lama) | 43/0 | **43 lulus, 0 gagal** |
| `npx tsc --noEmit` | 0 | **0** |

## Yang ditambal, per celah

### C-1 — jalur melar diterima lalu diteruskan ke jembatan disk
`alasanBlokirRahasia()` (baris ~610-665) kini memeriksa **bentuk MENTAH** sebelum
`normalJalur()` merapikannya:

- `mentah.startsWith('/')` → tolak (`/etc/hosts`, `//server/share/x.ts`, `C:/Windows/win.ini` tak lagi lolos sebagai `etc/hosts` dll).
- `/^[A-Za-z]:\//` → tolak absolut Windows, **tanpa** memakan nama sah seperti `a:b.ts` (butuh pemisah sesudah titik-dua).
- `..`, `../x`, `a/../../b` → tolak; `%2e`/`%2f`/`%5c` → tolak (gagal-tertutup, modul tidak men-dekode).

Ditambah di `saring()` (baris ~940-955): pemeriksaan bentuk mentah dijalankan
**sebelum** `normalJalur()`, sebab `normalJalur('/etc/hosts')` = `etc/hosts` dan
`normalJalur('\\server\share\x.ts')` = `server/share/x.ts` — sesudah dirapikan,
jejak melarnya hilang dan berkasnya lolos masuk daftar (terbukti di kasus B7/B10).

### C-2 — over-block folder repo `etc/`, `sys/`, `proc/`, `var/db/`, `docs/etc/`
Aturan folder dipisah tegas:

- folder **ber-titik** (`/.ssh`, `/.gnupg`, `/.aws`, `/.git`, …) tetap berlaku pada jalur relatif;
- folder **sistem absolut** hanya berlaku kalau **akar repo sendiri** ada di dalamnya (seluruh isi repo memang terproteksi).

Vonis folder dari `periksaBaca()` **diabaikan** (`gerbang.alasan.includes('direktori terproteksi')`):
`periksaBaca()` memakai pencocokan substring yang sama longgarnya, jadi ia ikut
memakan `docs/etc/panduan.md` milik repo. Alasan lain dari gerbang itu (byte
kontrol, pola nama rahasia) tetap berlaku.

Kemampuan tidak dikurangi: berkas yang tetap terdaftar bertambah, bukan berkurang
(B11 sebelum 4/5 → sesudah 5/5).

### C-3 / D2 — laporan pemotongan dimakan pemotongan karakter
Baris `- Truncated: …` dan catatan rahasia kini ditulis **sebelum** daftar 300
berkas (susunRingkasan, baris ~1067-1090). Daftar berkaslah yang paling sering
menghabiskan anggaran, jadi kalau laporannya di belakang, dialah yang terpotong
lebih dulu dan pembaca kehilangan keterangan "kenapa daftar ini tidak lengkap".

Tambalan kedua untuk D2: `only the first ${angkaRibu(BATAS_PINDAI_BERKAS)} entries`
— dulu mencetak `5000`, kontrak teksnya `5.000`. Helper `angkaRibu()` (baris
~1035-1048) menghitung pemisah ribuan sendiri, **bukan** `toLocaleString()`,
supaya keluaran tetap deterministik lintas mesin/ICU (`toLocaleString` tak dipakai
di berkas ini: 0 kemunculan).

### C-4 / D5 — ringkasan MELEBIHI anggaran sendiri
Potongan lama memotong dulu lalu menempel penanda, jadi hasilnya 6.027 > 6.000
dan justru melubangi janji batasnya sendiri. Sekarang penanda dihitung dua kali
(ruang disisakan sebelum memotong, angka final dipakai untuk penanda), keluaran
5933 ≤ 6.000 char, dan penandanya menyebut berapa karakter dibuang.

### C-5 — biner memakan 97% anggaran byte
Biner **tetap terdaftar** (kemampuan tidak dikurangi), tapi porsi byte-nya
dihitung terpisah:

- `AKHIRAN_BINER` (regex ekstensi biner) ditambahkan sesudah `AKHIRAN_KODE`;
- field baru `StatKonteksRepo.byteBinerTampil` + akumulatornya di `bangunKonteksRepo`;
- ringkasan menyebut `binaries take X of the Y listed corpus budget` begitu biner
  memakai lebih dari separuh anggaran.

Kasus C2 di harness diubah dari pin `kC.berkas.length === 0` (yang bertabrakan
dengan C1: masukan identik, tuntutan berlawanan) menjadi **pin keputusan**:
biner terdaftar 6/6 dengan label bahasanya, `byteBinerTampil` dilaporkan, dan
disebut di ringkasan. Ini bukan pelonggaran — jumlah berkas yang terdaftar
**dinaikkan**, bukan diturunkan.

### Perbaikan alat ukur (bukan pelonggaran)
Kasus H3 mengukur "rahasia tersentuh" dengan menyerahkan jalur **absolut** hasil
panggilan `fs_stat`/`fs_read` ke `alasanBlokirRahasia()`. Kontrak modul: yang
masuk ke fungsi itu selalu jalur **relatif**, dan jalur absolut memang ditolak di
sana (kasus B4/B5) — jadi setiap jalur absolut terhitung "rahasia" dan ujinya
merah tanpa sebab. Ukurannya kini memakai bentuk relatif terhadap akar
(`relBawah()`); tuntutannya tetap: 0 berkas rahasia tersentuh, `tampil === 3`.

## Sisa yang belum dikerjakan (bukan bagian dari 5 celah)

- `src/lib/agentGuard.ts:180-211` — `periksaBaca()` sendiri masih memakai
  pencocokan substring (`${cmp}/`.includes(`${dir}/`)). Modul konteksRepo kini
  kebal, tapi pemanggil lain `periksaBaca()` masih bisa kena over-block/under-block
  yang sama. Berkas itu dipegang pemilik lain → usulan, bukan tambalan.
- `src/lib/konteksRepo.ts` `BATAS_CHAR_RINGKASAN = 6_000` tidak dinaikkan; yang
  dibetulkan adalah keluaran yang melampaui batas, bukan batasnya.
