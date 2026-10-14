# Perilaku anak-agen Zephyr — subset tool, pemadatan riwayat, paksa todo

Dokumen ini menuliskan **aturan yang berlaku sekarang** setelah tiga item backlog
dikerjakan (`LAMA-a1`, `LAMA-a2`, `LAMA-a4`), beserta angka ambangnya, daftar
keputusan yang bisa dibaca, dan cara membuktikannya.

Ukuran yang dipakai semuanya dari pengukuran nyata, bukan asumsi:
`docs/AUDIT-TOOL-BERKAS-2026-10-14.md` + `docs/AUDIT-KATALOG-TOOL.md`
(katalog **68** tool, kirim-selalu **26**, batas kebijakan **20 tool per giliran**,
hasil ukur 6 tugas nyata: 17 / 23 / 23 / 20 / 23 / 23 → **4 dari 6 menembus 20**).

> **Catatan angka (diperbarui 2026-10-14).** Dulu di sini tertulis "katalog 67 tool, aktif-default 26".
> Katalog 67 → **68** sejak `zephyr_kode` masuk (`TOOL_COUNTS` dihitung dari katalog, bukan diketik),
> dan label untuk angka 26 itu yang benar adalah **kirim-selalu** (`TOOL_DIKIRIM_SELALU`).
> Aktif-default milik app sekarang **63** (`TOOL_INTI` 57 + `TOOL_WEB_AKTIF_AWAL` 6, `toolGate.ts:186`).

| Berkas | Peran di sini |
|---|---|
| `src/lib/subsetTugas.ts` | modul **murni**: subset tool per kelas tugas (LAMA-a1) + keputusan paksa todo (LAMA-a4) |
| `src/lib/aiStore.ts` | pemadatan riwayat murni (LAMA-a2) + titik sambung a1/a4 ke jalur agen |
| `scripts/cek-subset-tugas.mjs` | harness 1 — subset ≤ 20 + kemampuan **superset** |
| `scripts/uji-anak-agen.mjs` | harness 2 — subset, pemadatan riwayat, paksa todo |

---

## LAMA-a1 — subset tool per tugas (selalu ≤ 20)

**Aturan, urut prioritas:**

1. **Selalu ≤ 20 tool** (`BATAS_TOOL_TUGAS = 20`). Ini batas yang diukur audit;
   4 dari 6 tugas nyata menembusnya (23–26) sebelum pemangkasan.
2. **Tool inti selalu ikut** — `TOOL_INTI_TUGAS` (10 nama): `read_file`,
   `write_file`, `grep`, `glob`, `bash_run`, `todo_write`, `think`, `ask_user`,
   `tool_search`, `tool_call`. Di luar itu, `run_subagent`/`run_subagents` dan
   `bash_background`/`bash_logs` datang dari keluarga dewasanya (delegasi,
   shell-latar), jadi tugas yang butuh tetap dapat. Tidak ada tugas yang
   kehilangan kemampuan dasar karena pemangkasan.
3. **Yang dipangkas adalah KEMBAR, bukan kemampuan.** Dua keluarga kembar yang
   diukur audit:
   - `edit` vs `multi_edit` vs `replace_in_files` → satu jadi "rumah", sisanya
     dipangkas (masih bisa dipanggil lewat `tool_call`).
   - `run_subagent` vs `run_subagents` → satu rumah.
4. **Pintu darurat selalu terbuka.** `tool_search` + `tool_call` ada di
   `TOOL_DIKIRIM_SELALU` dan tidak pernah dibuang, jadi setiap tool yang
   dipangkas **tetap bisa ditemukan lalu dipanggil** — satu langkah lebih jauh.
   Inilah alasan aturan ini disebut "memangkas token", bukan "mencabut alat".
5. **Tidak ada kemampuan yang boleh hilang (wajib SUPERSET).** Ukurannya
   keluarga kemampuan (`KELUARGA_TOOL`): keluarga pada daftar hasil harus
   **superset** keluarga pada daftar lama. Harness 1 gagal (exit ≠ 0) kalau ada
   satu keluarga yang hilang.

### Definisi "perlu menulis / perlu jaringan" dipinjam, tidak disalin

`subsetTugas.ts` mengimpor `bentukTugas` (`./agentDorong`) dan `tugasButuhWeb`
(`./subsetAlat`) — dua fungsi yang **sudah** menentukan aturan itu di app. Ini
bukan kerapian, tapi keharusan: percobaan pertama memakai daftar kelas sendiri,
dan langsung salah pada pesan ambigu ("lanjut"): `subsetAlat` tetap mengirim 23
tool karena `bentukTugas('lanjut') === 'netral'` (arah salah harus ke "masih bisa
menulis"), modul ini cuma 17 → **kemampuan hilang justru di kasus paling tidak
jelas**. Setelah dipinjam, superset jadi konsekuensi, bukan klaim.

### Angka sebelum → sesudah (basis nyata: `TOOL_DIKIRIM_SELALU`, 26 tool)

Dari `node scripts/cek-subset-tugas.mjs`:

| Kelas tugas (contoh nyata) | sebelum | sesudah | dipangkas |
|---|---|---|---|
| baca berkas | 17 | 17 | 9 |
| perbaiki kode + uji | 23 | **20** | 6 |
| tulis banyak berkas | 23 | **20** | 6 |
| web + berkas | 20 | 17 | 9 |
| shell + hapus (repo-wide) | 23 | **18** | 8 |
| repo-wide + tulis | 23 | **20** | 6 |
| "lanjut" (ambigu) | 23 | 19 | 7 |
| uji + shell | 23 | 18 | 8 |
| git (+panel) | 17 | 17 | 9 |
| jadwal | 23 | 20 | 6 |
| memori | 23 | 18 | 8 |
| panel/browser | 23 | 19 | 7 |

MAKS sesudah pemangkasan: **20** (target ≤ 20). Kemampuan hilang: **0**.

### Titik sambung (siapa memanggil siapa)

- `src/lib/aiStore.ts` (jalur agen, **sudah tersambung**):
  `alatKirim = gerbangRencana ? alatRencanaPertama(...) : pilihToolTugas(tugasRun, alatAktif, adaFolderRun)`.
  Sebelumnya `alatUntukTugas(...)`.
- `src/lib/devBridge.ts` (jembatan penguji, **milik lane lain**): masih memakai
  `alatUntukTugas` untuk membuktikan subset lewat `__ZEPHYR__.subsetAlat(...)`
  tanpa menunggu run nyata. Usulan tambalannya ada di
  [`docs/USULAN-SUBSET-TUGAS.md`](USULAN-SUBSET-TUGAS.md) — jangan diubah sendiri.

---

## LAMA-a2 — pemadatan riwayat murni (tanpa panggilan model)

### Kenapa ada varian murni, di samping `padatkanRiwayat` yang memanggil model

`padatkanRiwayat` (model-based) sudah ada dan bagus, tapi punya tiga sifat yang
membuatnya tidak selalu bisa diandalkan — dan riwayat yang mendekati ambang tidak
selalu punya waktu untuk satu panggilan model lagi:

1. **Bisa GAGAL** (`catch → null`): jaringan, kuota, provider menolak. Riwayat
   dibiarkan utuh dan siklus berikutnya mencoba lagi — sambil tetap di atas ambang.
2. **Bisa membatalkan diri** (`sesudah >= sebelum`): ringkasan model lebih panjang
   dari bahannya.
3. **Tidak menjamin APA yang bertahan.** Prompt-nya meminta pekerjaan yang belum
   selesai dipertahankan, tapi yang mengerjakan itu model: daftar tugas setengah
   jalan bisa hilang tanpa ada yang menyadarinya.

`padatkanRiwayatMurni` menutup ketiganya: tanpa model, tanpa jaringan,
deterministik, dan jaminannya diperiksa mesin.

### Ambang dan rasio (angka yang dipakai)

| Konstanta | Nilai | Arti |
|---|---|---|
| `AMBANG_PADAT_RASIO` | `0.80` (= `AUTO_COMPACT_AT` dari `contextBudget`) | porsi jendela konteks yang jadi ambang |
| `AMBANG_PADAT_TOKEN` | `102_400` token (= 0,8 × 128.000) | **ambang default**, satuan TOKEN |
| `PADAT_SIMPAN_EKOR` | `6` (= `AUTO_COMPACT_KEEP`) | pesan terakhir yang selalu utuh |
| `RASIO_RINGKAS_TARGET` | `0.50` | target catatan ≤ 50% bahan yang digantikan |
| `PADAT_BATAS_KEPUTUSAN` | `12` | maksimum butir keputusan di catatan |
| `PADAT_BATAS_BERKAS` | `20` | maksimum berkas yang dilaporkan |
| `PADAT_BATAS_POTONGAN` | `220` karakter | panjang satu kutipan di catatan |
| `PADAT_BATAS_BARIS_USER` | `6` | maksimum baris kebutuhan user di catatan |

**Satuan ambang: TOKEN, bukan karakter.** Ini pernah salah dan salahnya senyap:
ambang dihitung dari `PAYLOAD_MAX_CHARS` (40.000 **karakter**) × 0,8 = 32.000,
sementara `perkiraanKonteks` mengembalikan **token** — jadi pemadatan praktis
tidak pernah menyala (32.000 token baru tercapai di sekitar 128.000 karakter).
Sekarang ambang memakai satuan yang sama dengan meter konteks dan dengan
`batasAutoCompact(model)`; pemanggil yang tahu modelnya boleh menurunkan ambang
lewat `opts.batasToken` (jalur agen mengirim `batasAutoCompact(def.id)`).

### Jaminan (dalam urutan kepentingan)

1. **Item tugas yang belum selesai tidak pernah hilang.** Sumbernya, dari yang
   paling otoritatif: (a) `todos` yang dikirim pemanggil, (b) argumen `todo_write`
   di riwayat, (c) baris checkbox `- [ ]`/`- [~]` di transkrip (`- [x]` dilewati
   karena sudah selesai). Isinya dikutip **verbatim** di dalam catatan
   (`TUGAS BELUM SELESAI (WAJIB diteruskan...)`) **dan** dikirim lagi sebagai
   **pesan user tersendiri** di depan ekor riwayat — dua lapis, supaya isinya
   tetap ada meski ada lapis lain yang memangkas pesan.
2. **Pemadatan yang tidak mengecil dibatalkan** (`dipadatkan: false`, riwayat
   asli dikembalikan) — persis sikap `padatkanRiwayat`.
3. **Riwayat `system` selalu utuh dan tetap di depan.**
4. **Deterministik**: masukan sama → hasil sama; tanpa jam, jaringan, atau acak.
5. **Keputusan penting dibawa**: tujuan awal user (kalimat pertama pesan user
   pertama) + baris asisten berpenanda keputusan (`keputusan`, `diputuskan`,
   `dilarang`, `wajib`, `root cause`, `kesimpulan`, ...), yang diambil yang
   **paling baru** karena keputusan lama yang sudah digantikan tidak perlu dibawa.
6. **Berkas yang sedang digarap dilaporkan**: argumen tool berkas
   (`read_file`/`write_file`/`edit`/`multi_edit`/`replace_in_files`/`delete_file`/
   `move_file`/`copy_file`/`create_directory`) lebih akurat daripada teks, jadi ia
   didahulukan; sisanya dari path yang disebut di teks. Asas "sebutan terakhir
   menang", `PADAT_BATAS_BERKAS` item terakhir yang dikembalikan.

### Titik sambung (sudah aktif)

Di jalur agen (`src/lib/aiStore.ts`), blok auto-compact memanggil
`padatkanRiwayat` (model) seperti sebelumnya. **Baru:** kalau ia mengembalikan
`null` (gagal / tidak ada bahan), jalur cadangan murni jalan:

```
if (hasil) { ...jalur model... } else { padatkanRiwayatMurni(history, { todos, batasToken: batas }) }
```

Kalau `dipadatkan === false` (tidak mengecil / tidak ada bahan), **tidak ada apa
pun yang berubah** — jadi ini tidak pernah memperburuk keadaan. Kalau berhasil,
`langkahRiwayat` ikut dikosongkan (wajib: ia di-zip dengan `history` lewat jumlah
asisten), notis ditampilkan, dan jejaknya dicatat di `jejakPemadatan` supaya
harness bisa membuktikan isi riwayat yang benar-benar dikirim sesudah pemadatan.

---

## LAMA-a4 — paksa todo di tugas berat

**Aturan:** tugas berat **wajib** menulis todo di langkah pertama; tugas ringan
tidak. Keputusannya bisa dibaca (`keputusanTodo(teks)` / `ringkasKeputusanTodo`),
bukan angka ajaib.

Kata kunci berat (`KATA_BERAT`, 10 entri) — masing-masing membawa alasannya:

| kata | cakupan pola | kenapa berat |
|---|---|---|
| `bikin` | bikin | membuat dari nol = banyak langkah |
| `buat` | buat, buatkan, bangun, membangun | membuat = banyak langkah |
| `perbaiki` | perbaiki, benerin, benahi, fix, debug, refactor, restruktur | cari sebab → ubah → uji |
| `semua` | semua, seluruh, sekujur, puluhan, banyak | cakupan luas, urutan kerja harus dijaga |
| `migrasi` | migrasi, migrasikan, ganti nama, rename | perubahan menyeluruh, gampang setengah jalan |
| `uji` | uji, test, tes, lint, verifikasi, regresi, build | mengubah keadaan repo |
| `hapus` | hapus, buang, bersihkan, rapikan, prune | tidak bisa dibatalkan |
| `integrasi` | integrasi, implementasi, sambungkan, pasang | menyentuh beberapa tempat |
| `tambah` | tambahkan, tambah | biasanya lebih dari satu berkas |

Dua pemicu tambahan: **cakupan angka** (`20 komponen`, `3 berkas`, ... — mulai
dari 3) dan **permintaan berbentuk daftar** bernomor/bergaris.

**Lima tingkat yang diuji** (`node scripts/uji-anak-agen.mjs`):

| tingkat | contoh tugas | `wajibTodo` |
|---|---|---|
| sangat ringan | "Baca src/lib/aiStore.ts lalu jelaskan" | `false` |
| ringan | "Ringkas isi docs/ANALISIS-TERBARU.md" | `false` |
| sedang | "Perbaiki bug di src/lib/a.ts" | `true` |
| berat | "Tulis 20 komponen React baru di src/components/admin" | `true` |
| sangat berat | "Rapikan seluruh repo: migrasi semua berkas, hapus build, jalankan uji" | `true` |

**Titik sambung (sudah aktif):** gerbang rencana langkah pertama di
`src/lib/aiStore.ts` dipicu oleh
`beratRun = tugasBerat(tugasRun) || wajibTodo(tugasRun)`.
Heuristik lama (`tugasBerat` di `subsetAlat`) menuntut teks panjang / berdaftar /
majemuk, sehingga perintah tunggal yang jelas berat — "perbaiki bug di
src/lib/a.ts" — lolos dan langsung menulis tanpa rencana. Hasilnya **OR**: tugas
yang dulu berat tetap berat, tidak ada yang jadi lebih ringan.

---

## Cara membuktikan

```bash
cd /d/Zephyr
node scripts/cek-subset-tugas.mjs          # LAMA-a1: 12 kasus, ≤20 + superset keluarga
node scripts/cek-subset-tugas.mjs --rinci  # + rincian per tool & alasan pemangkasan
node scripts/uji-anak-agen.mjs             # LAMA-a1/a2/a4: 29 pemeriksaan
npx tsc --noEmit                           # 0 galat
```

Keduanya keluar **≠ 0** kalau ada yang tembus 20, kemampuan berkurang, item tugas
belum selesai hilang, atau tugas berat lolos tanpa wajib todo.

Catatan teknis harness: fungsi yang diuji hidup di modul TypeScript app, jadi
keduanya membundel modul murninya ke CommonJS di `node_modules/.cache/zephyr-harness/`
lalu `require` dari Node (untuk `aiStore.ts`: React/zustand di-`external` + DOM
minimal dipalsukan sebelum require). Bundelnya mendarat di
`node_modules/.cache/zephyr-harness/` (bukan source): harness 1 membiarkannya di
sana sebagai cache antar-jalan, harness 2 membersihkannya di akhir kecuali
`ZEPHYR_HARNESS_SIMPAN_CACHE=1` (berguna saat menelusuri bundel yang gagal).
