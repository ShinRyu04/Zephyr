# LAPORAN PROVIDER-FALLBACK — retry berjenjang, backoff, fallback, batas waktu, pesan jujur

- **Item**: ZEPH-PROVIDER-FALLBACK
- **Tanggal**: 14 Oktober 2026
- **Pemilik**: subagent lane ini (berkas di bawah tidak dikerjakan lane lain — lane sebelumnya mati 429 dengan 0 artefak)
- **Kode yang diuji**: `src/lib/providerTahan.ts` (913 baris / 37.107 B) diuji oleh `scripts/uji-provider-fallback.mjs` (1.105 baris / 42.397 B)
- **Cara jalan**: `cd D:/Zephyr && node scripts/uji-provider-fallback.mjs` — deterministik, **tanpa jaringan** (`fetch` tidak pernah dipanggil), tanpa model, tanpa Tauri, tanpa app, tanpa CDP (:9223). Modul .ts dibundel saat jalan dengan esbuild lokal ke `%TEMP%/zephyr-uji-provider`, lalu diimpor. Tidak ada berkas repo yang ditulis.

---

## 1. Vonis

**Kode saat ini MEMENUHI** keempat tuntutan item, dan kebenarannya terbukti pada kode asli repo, bukan pada salinan uji:

| Tuntutan | Bukti (id kasus) |
|---|---|
| (a) retry berjenjang + backoff untuk 429 **dan 5xx** | `a1`, `a2`, `b2`, `b3`, `e1`, `e4`, `e5`, `i4` |
| (b) fallback antar-model/provider | `g1`, `g2`, `g3`, `g4`, `g5` |
| (c) batas waktu per giliran | `h1`, `h2`, `j2`, `j3` |
| (d) pesan jujur ke user ("provider menolak sementara, ini yang dicoba") | `d1`–`d5`, `f2`, `k2`, `k3` |
| Tak boleh bocor kunci/header ke log | `c1`, `c2`, `i2`, `i3` |

**Yang BELUM tersambung ke jalur panggilan model di produk**: lapisan ini masih berkas mandiri. `src/lib/aiStore.ts` belum mengimpornya. Rincian berkas+baris+teks lama/baru ada di `docs/USULAN-PROVIDER-FALLBACK.md`. Itu diakui terbuka di §5 laporan ini.

---

## 2. ANGKA NYATA (dari pesan provider — dipakai apa adanya, tidak dikarang)

| Besaran | Angka |
|---|---|
| Jendela batas | **60 detik** |
| Plafon permintaan **BERHASIL** | **60 per menit per kredensial/klien** |
| Plafon percobaan **TOTAL** | **70 per menit per kredensial/klien** |
| Perilaku lama yang HARUS diganti | **"menyerah setelah 3 percobaan"** — pesan nyata lane yang mati: `` `<model>` rate-limited every one of 3 attempts `` |
| Kejadian nyata | 429 membunuh **2 dari 4** anak delegasi: **1439 s** & **1455 s** durasi, **104** & **102** panggilan, kedua lane mati di detik **~254** dan **~53** |

Angka-angka itu hidup di satu tempat di modul, `JENDELA_PROVIDER = { detik: 60, maksPercobaan: 70, maksSukses: 60 }`, dan dipakai baik oleh limiter (`jatahJendela`), oleh kalimat ke user (`pesanGagal`), maupun oleh uji (`j0` memeriksa ketiga angka itu **apa adanya** — kalau ada yang "membulatkan" jadi 100/60, `j0` merah).

Konsekuensi yang sengaja diambil dari angka itu:
- **60 sukses/menit adalah batas yang lebih ketat** daripada 70 percobaan untuk giliran yang sehat. Jadi jendela mengunci pada *jawaban*, bukan hanya pada percobaan (dibuktikan `j1`: 60 jawaban saja sudah menutup jendela → tunggu 30.000 ms).
- Anggaran menit itu **milik kredensial, bukan milik satu giliran**. Jendela hidup di objek `JendelaKredensial` milik caller dan dipakai ulang oleh setiap giliran (`j3`: 130 giliran beruntun → menahan diri **2×** selama 60.000 ms, bukan 130 percobaan dalam sekejap yang memicu ban lebih panjang).
- Kalau jendela penuh, lapisan **MENUNGGU** entri tertua kedaluwarsa dan menyebut tunggu itu ke user — ia tidak mengirim percobaan yang sudah jelas akan di-429.

---

## 3. Bukti keluaran apa adanya

### 3a. Harness — `node scripts/uji-provider-fallback.mjs` → `EXIT=0`, **41 pemeriksaan — 41 hijau, 0 merah**

Bagian yang membuktikan tiga kasus yang diminta khusus (angka dari jalan nyata):

```
(J) jendela kredensial — 70 percobaan / 60 jawaban per 60 detik
  LULUS  j0-angka-provider-apa-adanya   angka dari pesan provider dipakai apa adanya di modul & di uji ini: jendela 60 dtk, 70 percobaan, 60 sukses (bukan angka karangan)
  LULUS  j1-jatah-jendela-dihitung      jatahJendela: 70 percobaan → tunggu 25500 ms (sebab percobaan); 60 JAWABAN saja sudah menutup jendela → tunggu 30000 ms (sebab sukses); setelah jendela bergeser 11 dtk → boleh kirim
         maxSukses (60/menit) adalah batas yang lebih ketat untuk giliran sehat; 60 jawaban mengunci sebelum 70 percobaan tercapai
  LULUS  j2-satu-giliran-tidak-melampaui-70 satu giliran menembak 210 percobaan tanpa melampaui plafon: paling banyak 70 percobaan di jendela 60 dtk mana pun (plafon 70), dan lapisan MENUNGGU jendela 2× × 60.000 ms = 120000 ms sebelum kirim berikutnya
         percobaan=210 waktu-palsu-total=120000 ms jeda-jendela=[60000, 60000] berhenti=anggaran-habis
  LULUS  j3-60-jawaban-per-menit-dihormati 130 giliran beruntun pada SATU kredensial (jendela milik caller, bukan per giliran): 130 jawaban, paling banyak 60 di jendela 60 dtk mana pun (plafon 60) — lapisan menahan diri 2× selama 60000 ms
         waktu-palsu-total=120000 ms; sisa jendela saat giliran terakhir selesai: 10 percobaan / 10 jawaban — tanpa jendela bersama, 130 giliran ini bisa jadi 130 percobaan dalam beberapa detik dan memicu ban yang jauh lebih panjang

(K) anggaran sebagai ganti "3 percobaan", pesan jujur, kerja di disk utuh
  LULUS  k1-bukan-3-percobaan-lalu-menyerah diganti: alih-alih "menyerah setelah 3 percobaan" (<model> rate-limited every one of 3 attempts), kandidat yang sama di-429 sampai 20× dalam satu kandidat sebelum pindah — dan pesannya menyebut "20×"
         jeda-jeda=[100, 200, 400, 800, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] ms (backoff ×2 sampai langit-langit 1000 ms — jeda tumbuh, bukan tiga percobaan cepat lalu menyerah)
  LULUS  k2-semua-provider-gagal-kerja-utuh ketiga kandidat gagal (semua 429, 6 percobaan) → berkas kerja di disk UTUH: isi identik, ukuran 143 B, mtime tidak bergeser (1791939534940.777 = 1791939534940.777) — kegagalan provider tidak boleh membuang pekerjaan yang sudah selesai
         berkas: C:\Users\Zyrex\AppData\Local\Temp\zephyr-uji-provider\kerja-selesai.txt
  LULUS  k3-pesan-memuat-sebab-provider-percobaan pesan ke user memuat SEBAB (429 / limit permintaan), PROVIDER mana saja yang dicoba (m1/p1, m2/p2, m3/p3), dan NOMOR percobaan (6×) + satu tindakan — bukan gagal diam-diam
         pesan (385 karakter): Provider menolak sementara karena limit permintaan (429) di jalur agent — batasnya 70 percobaan / 60 jawaban per 60 dtk. Sudah dicoba 6× — 2× m1 (p1), 2× m2 (p2), 2× m3 (p3) — dengan jeda bertambah, dan tidak ada yang menjawab. Tunggu ~1 me…
  LULUS  k4-modul-tak-menyentuh-disk    modul ketahanan tidak mengimpor fs/process.env (0 kecocokan node:fs|require(|process.env di bundel 20624 B) dan folder sementara (C:\Users\Zyrex\AppData\Local\Temp\zephyr-uji-provider) berada DI LUAR repo — uji ini tidak menulis berkas repo
         bukti kerja-utuh di atas karena itu ditulis ke folder sementara, bukan ke repo

Ringkasan uji-provider-fallback: 41 pemeriksaan — 41 hijau, 0 merah
kesimpulan: retry berjenjang + backoff berbatas + fallback + batas waktu giliran + pesan jujur + penyaring rahasia SEMUA terbukti pada kode saat ini (tanpa jaringan)
```

> Satu-satunya angka di potongan di atas yang berubah antar-jalan adalah stempel `mtime` berkas uji (berkas `kerja-selesai.txt` ditulis ulang tiap jalan, jadi angka desimalnya bergeser; ukuran 143 B dan sifat "identik" tidak berubah). Semua kalimat lain dipotong apa adanya dari keluaran nyata.

Terjemahan tiga kasus yang diminta khusus:

- **(a) semua provider gagal → pekerjaan di disk tidak hilang.** `k2`: 3 kandidat, semuanya 429, 6 percobaan → berkas kerja yang sudah ditulis giliran sebelumnya **identik byte-per-byte, ukuran 143 B, mtime tidak bergeser satu milidetik pun**. Kegagalan provider tidak menyentuh disk. Turunannya diperkuat `k4`: modul tidak mengimpor `fs`/`process.env` (0 kecocokan di bundel), dan folder bukti berada di luar repo.
- **(b) anggaran per menit tidak boleh > 70 percobaan / 60 sukses per 60 detik.** `j2`: satu giliran menembak **210** percobaan tanpa jeda (jeda 0) dengan **jam palsu**; hitungan jendela selebar 60 dtk mana pun = **maksimum 70** percobaan, dan lapisan **menunggu 2× × 60.000 ms**. `j3`: **130 giliran** pada satu kredensial → **130 jawaban**, maksimum **60** di jendela 60 dtk mana pun, menahan diri 2×. `j1` membuktikan aritmetikanya (25.500 ms / 30.000 ms / boleh kirim setelah jendela bergeser).
- **(c) 401/403 TIDAK diulang.** `a1`: `vonisStatus(401)` = `{bolehUlang:false, sebab:'kredensial'}`, idem 403. `f1`/`f2`: jalur nyata — panggil dihitung **1×** lalu berhenti `permanen`, **tanpa** pindah kandidat, dan pesannya menyebut kredensial + Settings. `a2` menguji 12 teks galat nyata (rangkaian permanen-dulu sama urutannya dengan `isRetryableAgentProviderError` di `aiStore.ts`).

### 3b. Kompilasi ketat → **0 galat**

```
$ npx --no-install tsc --noEmit -p tsconfig.json      # seluruh proyek
TSC_EXIT=0        # 0 baris "error TS"

$ npx --no-install tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --useDefineForClassFields ... src/lib/providerTahan.ts
EXIT=0
```

### 3c. Harness tetangga tetap hijau

```
$ node scripts/uji-ketahan-agen.mjs
Ringkasan uji-ketahan-agen: 14 pemeriksaan — 14 hijau, 0 merah
kesimpulan: ketiga cacat lama (busy/merah/besar) TIDAK terbukti lagi pada kode saat ini
UKA_EXIT=0
```

### 3d. Determinisme

15 jalan berturut-turut, baris vonis (id + LULUS/GAGAL) di-hash:

```
$ for i in $(seq 1 15); do node scripts/uji-provider-fallback.mjs | grep -E "^  (LULUS|GAGAL)" | awk '{print $1,$2}' > d-$i.txt; done
$ md5sum d-*.txt | awk '{print $1}' | sort -u | wc -l
1          # 15 jalan → SATU hash unik
$ wc -l < d-1.txt
41
run bermerah: 0 dari 15
```

**Cacat yang ditemukan & diperbaiki di jalan ini (jujur, karena vonis sebelumnya sempat 40/41):** kasus `h2-batas-giliran-menahan` dulu memakai **jam nyata** (`batasGiliranMs: 100` vs panggilan yang menggantung) sehingga vonisnya kadang merah — terukur 105 ms → "2 percobaan" alih-alih 3, muncul 2 dari 5 jalan dan sekali 1 dari 1. Kasus yang bisa berubah warna antar-jalan tidak layak disebut deterministik, jadi **jamnya disuntik** (`buatJam`, sama seperti bagian J): sekarang `h2` memakai waktu palsu dan angkanya pasti — **3 percobaan dalam 120 ms waktu-palsu, percobaan ke-4 tidak dikirim, anggaran masih sisa 3** (`ms === 120` diperiksa eksak). `h1` juga diperkuat: batas gilirannya dinaikkan ke 60 dtk supaya yang diuji hanya batas per percobaan, dan batas atas `ms` dilonggarkan ke 5.000 ms. Setelah perbaikan: **15/15 jalan hijau, 1 hash unik.**

---

## 4. Ke-41 kasus: apa yang dibuktikan masing-masing

| # | id | yang dibuktikan |
|---|---|---|
| 1 | a1-vonisStatus-12-kode | 12 kode HTTP diklasifikasi: 429/5xx/408 boleh diulang; **401/403 permanen** |
| 2 | a2-vonisGalat-12-teks | 12 teks galat nyata → sebab yang benar (termasuk "stream terputus" dan "cancel") |
| 3 | a3-galatProvider-bawa-status | `galatProvider` membawa `kode` + `setelahMs` apa adanya (tanpa menebak dari regex) |
| 4 | b1-retry-after-dibaca | header `Retry-After` bentuk detik/ tanggal HTTP/ sampah/ sudah lewat |
| 5 | b2-backoff-naik-terbatas | jeda tumbuh ×2 lalu **berhenti di langit-langit** (`[100,200,400,400,400]`) |
| 6 | b3-jitter-hanya-memotong | jitter hanya mengurangi, tidak pernah melewati langit-langit |
| 7 | b4-bawaan-ada-nama | bawaan modul dapat disebut namanya (3 percobaan/kandidat, 20 s cap, 120 s giliran, 60/70/60) |
| 8 | c1-saringRahasia-7-bentuk | 7 bentuk rahasia (`Bearer`, `x-api-key`, `api_key`, `access_token`, `password`, …) disaring |
| 9 | c2-tidak-over-redaksi | penyaring tidak berlebihan — kalimat normal tidak dirusak |
| 10 | d1-pesan-429 | pesan 429 memuat sebab + batas nyata (70/60/60 dtk) + tindakan |
| 11 | d2-pesan-401-jujur | pesan 401 jujur: kunci tidak akan sembuh dengan menunggu |
| 12 | d3-pesan-batas-waktu | pesan saat jam giliran habis |
| 13 | d4-pesan-dibatalkan | pesan saat user menekan Stop |
| 14 | d5-pesan-tunggu | kalimat saat menunggu (layar tidak kosong) |
| 15 | e1-429-3x-lalu-sukses | 429 tiga kali lalu sukses — berhenti tepat di anggaran |
| 16 | e2-lapor-saat-tunggu | tiap tunggu **dilaporkan** (`tahap:'tunggu'`) supaya UI bisa bicara |
| 17 | e3-berhenti-tepat-anggaran | berhenti tepat saat anggaran percobaan tercapai (tidak lebih) |
| 18 | e4-backoff-di-dalam-loop | jeda di dalam loop benar-benar bertambah |
| 19 | e5-retry-after-dihormati | `Retry-After` menang atas backoff bawaan |
| 20 | f1-kredensial-permanen | 401 → **1 panggilan**, berhenti `permanen`, tidak pindah kandidat |
| 21 | f2-pesan-permanen-keluar | pesan permanen keluar apa adanya (kunci salah tidak disembunyikan) |
| 22 | g1-fallback-kepakai | kandidat berikutnya **kepakai** saat kandidat pertama habis |
| 23 | g2-anggaran-lintas-kandidat | anggaran dihitung **lintas kandidat** (2+2 dari 4), kandidat ke-3 tidak dicoba |
| 24 | g3-dua-kali-pindah | dua kali pindah sampai kandidat habis |
| 25 | g4-sukses-pertama-tanpa-tunggu | sukses di percobaan pertama → **nol** tunggu (tidak ada jeda sia-sia) |
| 26 | g5-tanpa-kandidat-jujur | tanpa kandidat → pesan jujur (0 percobaan, pasang kunci) |
| 27 | h1-batas-percobaan-menahan | batas waktu **per percobaan** menahan (timer lokal, bukan jaringan) |
| 28 | h2-batas-giliran-menahan | batas waktu **per giliran** mengunci total (jam palsu: 3 percobaan dalam 120 ms, ke-4 tidak dikirim) |
| 29 | h3-batal-di-tengah | Stop di tengah tunggu → berhenti **setelah 2 panggilan**, bukan setelah tangga selesai |
| 30 | i1-determinisme | dua jalan identik → jejak/tunggu/pesan/percobaan sama persis |
| 31 | i2-tidak-ada-kunci-di-log | galat provider yang **mengecho header** tidak membocorkan kunci ke jejak/catat/pesan, sedangkan sebab (429) tetap terbaca |
| 32 | i3-modul-bisu-tanpa-console | modul tidak menulis ke console (0 baris tertangkap) |
| 33 | i4-stream-terputus-diulang | stream terputus (bukan salah kunci) diulang, sukses di percobaan ke-2 |
| 34 | j0-angka-provider-apa-adanya | 60 dtk / 70 percobaan / 60 sukses dipakai apa adanya di modul **dan** di uji |
| 35 | j1-jatah-jendela-dihitung | aritmetika jendela: tunggu 25.500 ms (percobaan) / 30.000 ms (sukses) / boleh kirim setelah bergeser |
| 36 | j2-satu-giliran-tidak-melampaui-70 | 210 percobaan → maks 70 di jendela mana pun + menunggu 2× 60.000 ms (jam palsu) |
| 37 | j3-60-jawaban-per-menit-dihormati | 130 giliran pada satu kredensial → maks 60 jawaban di jendela mana pun |
| 38 | k1-bukan-3-percobaan-lalu-menyerah | **20 percobaan** pada satu kandidat (bukan 3) lalu pindah; pesannya menyebut "20×" |
| 39 | k2-semua-provider-gagal-kerja-utuh | semua provider gagal → **kerja di disk utuh** (isi, ukuran, mtime) |
| 40 | k3-pesan-memuat-sebab-provider-percobaan | pesan memuat sebab + **provider mana saja** (m1/p1, m2/p2, m3/p3) + nomor percobaan + tindakan |
| 41 | k4-modul-tak-menyentuh-disk | modul tidak menyentuh fs/process.env; bukti ditulis di luar repo |

---

## 5. Yang BELUM tersambung ke UI (jujur)

Ini bagian yang paling mudah dibohongi, jadi ditulis dengan nomor baris.

1. **`providerTahan.ts` belum diimpor siapa pun.** `grep -rn "providerTahan" src/` → tidak ada hasil. Artinya: seluruh jaminan di §3 berlaku untuk modulnya, **belum** untuk giliran provider yang benar-benar dikirim produk.
2. **Jalur chat masih retry dua-langkah datar.** `src/lib/aiStore.ts:4915` `const RETRY_CHAT = [1200, 3000]` → paling banyak **3 percobaan** (retry 0..2), jeda tetap 1200/3000 ms, tanpa `Retry-After`, tanpa pindah model, tanpa batas waktu giliran, tanpa anggaran per-menit. Ini justru bentuk "menyerah setelah beberapa percobaan" yang diminta diganti.
3. **Kalimat akhir jalur chat masih galat mentah.** `aiStore.ts:4963` `get().onChunk({ id: reqId, err: terakhirErr })` — user menerima string galat provider apa adanya; tidak ada sebab-terjemah, provider mana saja yang dicoba, atau nomor percobaan. Inilah "gagal (hampir) diam-diam" yang diminta dihapus: `pesanGagal()` ada, tapi belum dipanggil di sini.
4. **Jalur agent lebih baik, tapi belum memakai lapisan ini.** Ia punya `AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500]` (baris 2101), fase tunggu-pulih `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]` = **38 detik** (baris 2203), satu fallback model (`pilihModelCadangan`, baris 6146), penjaga tanpa-kemajuan `agentWatchdog`, dan batas keras `AGENT_HARD_LIMIT_MS = 15 menit` (baris 2042). Yang tetap tidak ada di sana: penghormatan `Retry-After`, anggaran percobaan tunggal, dan **anggaran per-menit per kredensial** — dua lane paralel yang berbagi satu kunci tetap bisa menembus 70/menit bersama-sama.
5. **Anggaran menit butuh satu objek milik aplikasi.** `JendelaKredensial` harus hidup di level modul (satu per provider/key) dan diteruskan ke setiap `panggilTahan`; kalau dibuat per-giliran, uji `j3` menunjukkan persis kenapa itu salah (130 giliran tetap bisa mengirim 130 percobaan). Ini bagian dari usulan, bukan pekerjaan yang sudah selesai.
6. **Tidak ada yang di-`git add`/`commit`**; tidak ada berkas repo yang ditulis harness (bukti `k4`); harness CDP (:9223) **tidak dijalankan**.

## 6. Temuan sampingan (nyata, bisa dicek)

- **Komentar dan kode tidak cocok** di `aiStore.ts`: komentar baris **6105–6106** berkata "jeda bertingkat (15s, 30s, 60s) … Total ~105 detik", sedangkan konstanta sebenarnya di baris **2203** adalah `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]` → **38 detik**. Kalau anggaran menit mau disambungkan, komentar itu sebaiknya ikut dibetulkan supaya tidak ada yang mengira sudah 105 detik.
- **Anggaran percobaan `BAWAAN_PROVIDER_TAHAN.anggaranPercobaan = 8`** sengaja kecil untuk bawaan satu giliran; untuk kasus 429 panjang seperti kejadian nyata (104 & 102 panggilan) caller harus menaikkannya (uji `k1` memakai 70, `j2` memakai 210) — kalau tidak, yang menahan lebih dulu adalah anggaran, bukan jendela menit.

## 7. Cara mengulang bukti

```bash
cd D:/Zephyr
node scripts/uji-provider-fallback.mjs          # 41/41 hijau, exit 0, tanpa jaringan
node scripts/uji-ketahan-agen.mjs               # 14/14 hijau (regresi tetangga)
npx --no-install tsc --noEmit -p tsconfig.json  # 0 galat
```
