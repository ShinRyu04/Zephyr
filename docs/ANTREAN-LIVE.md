# ANTREAN-LIVE — pesan yang diketik SELAGI agen bekerja

Item asal (`LAMA-c`, permintaan Ryu): *"C kirim pesan/chat ke agen yang SEDANG kerja
(sekarang harus nunggu run kelar)."*

Sampai sebelum penyambungan ini, pesan yang diketik saat run agen aktif memang
**diterima** composer (diparkir di `antrian`), tetapi daftar itu baru dibaca setelah
run **selesai**. Pada run berat 20 menit artinya praktis tidak bisa mengetik apa pun:
koreksi yang datang di menit kedua baru terpakai setelah pekerjaan itu kelar.

Sesudah penyambungan ini pesan itu **masuk antrean, tidak hilang, dan ikut giliran
berikutnya** (disuntikkan ke `history` yang sedang berjalan lewat `suntikKonteks`),
bukan menunggu run selesai.

## 1. Titik sambung persis (berkas + baris + fungsi)

Nomor baris = keadaan berkas pada commit kerja `feat/ai-panel-vscode-layout` saat uji
terakhir dijalankan (`npx tsc --noEmit` = 0 galat).

### Dipanggil dari jalur nyata (`src/lib/aiStore.ts`) — TAMBAHAN saja

| baris | apa | fungsi |
| --- | --- | --- |
| 78–79 | impor | `giliranSelesaiPanel`, `rencanaMasukSaatSibuk` dari `./antreanPesan`; `giliranAntreanKeRiwayat`, `sisipKeDepanEkor` dari `./suntikKonteks` |
| 151–238 | helper modul | `KEPALA_PESAN_SEMENTARA` (160) + `suntikGiliranAntrean(antri, history, todos)` (182) — satu-satunya tempat giliran disuntik ke `history` |
| 4404–4469 | `send()` — branch `agentBusy` | pesan saat sibuk: `rencanaMasukSaatSibuk(...)` (4444) menentukan masuk / penuh / ditolak; barisnya ditulis ke `antrians[composerId]` dan dicerminkan ke `antrian` |
| 5414–5481 | drain di AWAL tiap langkah loop agen | dedupe identitas `antrian` + `antrians[COMPOSER_AKTIF]` (5425–5431), kosongkan kedua daftar (5433–5436), transkrip tetap memuat tiap pesan sekali (5437–5458), lalu `suntikGiliranAntrean(...)` (5474) |
| 7664–7694 | akhir run | `giliranSelesaiPanel(get().antrian, { sibuk: true })` (7682) untuk pesan yang masuk SESUDAH drain langkah terakhir, lalu dikirim lewat `kirimAntrian(0, COMPOSER_AKTIF)` (7692) |

### Sumber aturannya (modul murni, tidak disalin ke `aiStore.ts`)

| berkas | baris | ekspor |
| --- | --- | --- |
| `src/lib/antreanPesan.ts` | 49 | `indeksPanel?: number` pada `PesanAntrean` |
| | 375 | `keadaanDariPanel(baris, opsi)` — bungkus daftar panel jadi `KeadaanAntrean` 1:1 |
| | 416 | `kirimSaatSibuk(keadaan, teks, images, now)` |
| | 460 | `rencanaMasukSaatSibuk(baris, teks, images, now)` — RENCANA tulis-panel (masuk / ditolak + sebab / penuh + indeks yang dibuang) |
| | 507 | `giliranSelesaiPanel(baris, opsi)` — "giliran selesai": kepala antrean LANGSUNG diproses, sisanya menunggu |
| `src/lib/suntikKonteks.ts` | 254 | `susunGiliran` (SUDAH ADA, tidak diubah) |
| | 505 | `blokWajib(hasil)` |
| | 509 | `interface BahanGiliranAntrean` |
| | 540 | `giliranAntreanKeRiwayat(bahan)` |
| | 569 | `sisipKeDepanEkor(history, blok, predikatTool)` |

Aturan antrean **satu tempat**: `kirim`/`giliranSelesai` di `antreanPesan.ts` (yang
dijaga `scripts/uji-antrean-pesan.mjs`, 18 kasus). Penyusunan giliran **satu tempat**:
`susunGiliran` di `suntikKonteks.ts` (yang dijaga `scripts/uji-suntik-konteks.mjs`,
17 kasus). `aiStore.ts` hanya memanggil; tidak ada salinan aturan, tidak ada penyusun
kedua di dalam store.

## 2. Sebelum / sesudah perilaku

| keadaan | SEBELUM | SESUDAH |
| --- | --- | --- |
| Pesan berteks dikirim saat run agen aktif | diterima → diparkir di `antrian`; baru dibaca **setelah run selesai** (praktis "tunggu dulu" pada run panjang) | **masuk antrean** (tidak hilang, tidak ditolak) dan **disuntikkan di awal langkah berikutnya** sebagai giliran `user`: antrean → tugas → permintaan |
| Pesan saat **tidak** ada run aktif | langsung dikirim | **tidak berubah** — langsung dikirim (`masukAntrean=false`, antrean tidak diisi) |
| Pesan kosong / hanya spasi saat sibuk | diterima: toast "Added to the queue", draft dikosongkan | **DITOLAK** dengan sebab terbaca, **draft TIDAK dikosongkan** (kecuali baris hanya-gambar, lihat bawah) |
| Pesan > `BATAS_TEKS` (8192) saat sibuk | diterima (tanpa batas panjang) | **DITOLAK** (`terlalu-panjang`), draft tetap |
| Antrean sudah `BATAS_ANTREAN` (20) dan pesan baru masuk | tak ada batas / tak ada aturan tetap | pesan **TERLAMA dibuang** dan pesan **BARU tetap masuk**, dengan pemberitahuan yang menyebut baris yang dibuang |
| Pesan yang masuk **sesudah** drain langkah terakhir | duduk di `antrian` sampai user mengirim lagi | kepala antrean **langsung diproses** lewat jalur kirim yang sudah ada (`kirimAntrian`), sisanya menunggu urut |
| Pesan yang diketik selagi sibuk terlihat di panel antrean? | **tidak** (hanya masuk daftar datar yang tidak dirender) | **ya** — ditulis ke `antrians[composerId]`, daftar yang dirender panel |
| Rahasia di pesan mengantre | tidak masuk konteks (belum pernah disuntik) | tetap **tersensor** (`«disensor»`) sebelum masuk giliran — lewat `saring` yang sudah dipakai `susunGiliran` |
| Baris hanya-gambar (tanpa teks) di antrean | diteruskan sebagai teks kosong + catatan gambar | catatan gambar **dipertahankan** (berdiri sendiri kalau tidak ada teks), gambar tetap **tidak** dikirim ke tengah run |

## 3. Angka nyata (keluaran yang benar-benar dijalankan)

| perintah | keluaran | exit |
| --- | --- | --- |
| `node scripts/uji-antrean-live.mjs` | `== 22/22 lulus ==` (22 kasus: L1–L22) | `0` |
| `node scripts/uji-antrean-pesan.mjs` | `== 18/18 lulus ==` (tidak berubah) | `0` |
| `node scripts/uji-suntik-konteks.mjs` | `== 17/17 lulus ==` (tidak berubah) | `0` |
| `npx tsc --noEmit` | 0 baris keluaran → **0 galat** | `0` |

Catatan jujur soal `tsc` (ia bergerak selama lane ini bekerja): satu kali di tengah
pengerjaan `tsc` keluar `2` dengan **50 galat, semuanya di
`src/components/extensions/ExtensionsView.tsx`** (`error TS1131/TS1005/TS1359` — galat
sintaks, bukan tipe). Berkas itu **bukan milik lane ini** dan tidak saya sentuh; mtime-nya
`06:51:53`, yaitu beberapa detik sebelum pemeriksaan itu, jadi lane lain sedang
menyuntingnya. Penyaringan keluaran menunjukkan **0 galat di `src/lib/aiStore.ts`,
`src/lib/antreanPesan.ts`, dan `src/lib/suntikKonteks.ts`**, dan setelah tunggu 60 detik
`tsc` kembali `0` galat / exit `0`. Jadi klaim "tsc 0" di sini berlaku untuk berkas lane
ini; kalau berkas lane lain sedang setengah jadi, `tsc` bisa merah tanpa ada hubungannya
dengan penyambungan antrean.

Jalur GAGAL-nya juga dibuktikan, bukan hanya diklaim: salinan harness di direktori
scratch dengan satu kasus sengaja dirusak mencetak
`GAGAL  L20  ...` + `== 21/22 lulus ==` dan **exit `1`**. Jadi `== n/n lulus ==`
bukan hiasan: kalau ada kasus merah, skrip keluar bukan-nol.

Angka yang dipakai kasus uji (bukan karangan; dibaca dari modul): `BATAS_ANTREAN = 20`,
`BATAS_TEKS = 8192`, anggaran konteks `susunGiliran` = 65536 byte (kasus S16 mencetak
`367/65536 byte`). Kasus L11 memaksa anggaran 600 byte: yang dibuang hanya `riwayat`,
blok wajib (`antrean` + `tugas` + `permintaan`, `tugasTerjaga=3`) tetap utuh.

Cakupan `scripts/uji-antrean-live.mjs` (node-only, murni, tanpa app): pesan saat sibuk
masuk antrean dan urutannya terjaga (L1, L2); saat tidak sibuk tetap langsung (L3);
penuh → terbawaan dibuang + dilaporkan, pesan baru tidak ditolak (L4, L5); tolak
kosong/terlalu panjang (L6, L22); giliran berikutnya = SATU blok antrean + permintaan
baru (L7); dedupe dua daftar (L8); urutan konteks→riwayat→antrean→tugas→permintaan (L9);
hanya blok wajib yang disuntik (L10); tugas belum selesai tetap ada (L11); dua giliran
berturut-turut tidak menggandakan (L12, L13); rahasia tersensor (L14); antrean kosong
tidak menghasilkan blok kosong (L15); kepala antrean langsung diproses (L16); bawaan
aman tanpa penanda sibuk (L17); titik sisip menjaga pasangan assistant↔tool (L18, L19);
aksi antrean tetap bekerja sesudah penyambungan (L20, L21).

## 4. Keputusan interpretatif yang perlu dibaca (jujur)

1. **"Di depan ekor riwayat"** — artinya harfiah: blok diletakkan *sebelum* pesan
   terakhir riwayat, jadi pesan terakhir yang sudah ada tetap di ujung. Kalau ekor
   riwayat adalah **hasil tool**, menyisipkan `user` di antaranya membelah pasangan
   `assistant`(pemanggil tool)↔`tool`(hasilnya) dan itu memicu 400 — jadi pada kasus
   itu blok di-**append** sesudah hasil tool. Jalur normal loop agen selalu berakhir
   dengan hasil tool, sehingga cabang append-lah yang terpakai di praktik. Fungsi:
   `sisipKeDepanEkor` (suntikKonteks.ts:569), diuji L18/L19.
2. **`konteks` dan `riwayat` sengaja TIDAK diisi** saat menyuntik ke tengah run:
   keduanya sudah ada di `history` (konteks workspace dimuat jalurnya sendiri), jadi
   menyuntiknya ulang hanya menggandakan percakapan. Yang disuntikkan = pekerjaan yang
   **belum selesai**: pesan mengantre + tugas + permintaan giliran ini (L10).
3. **Antrean menyimpan teks yang DIKETIK**, bukan hasil ekspansi slash-command —
   supaya baris antrean menampilkan perintah (bukan paragraf) dan dua jalur tidak
   melenceng. Drain menjalankannya kembali lewat `send` yang mengekspansi sendiri.
4. **Baris hanya-gambar tidak lewat aturan antrean berteks**: `kirim()` menolak teks
   kosong, sedangkan panel menerima baris bergambar. Menolaknya akan menghilangkan
   gambar yang sudah ditempel user, jadi baris itu tetap diparkir lewat jalur lama dan
   catatan "gambar tidak diteruskan ke tengah run" tetap disampaikan.
5. **Selisih diff `src/lib/aiStore.ts` bukan seluruhnya pekerjaan lane ini.** Berkas itu
   sudah membawa perubahan belum-commit dari lane lain di cabang ini; lane ini hanya
   menambahkan bagian yang terdaftar di tabel §1 (perkiraan ~150 baris di lima titik).

## 5. BUTUH APP — yang BELUM terbukti di sini

Semua di bawah ini butuh aplikasi hidup (`npm run tauri dev`) dan **tidak** saya klaim:

1. **End-to-end**: mengetik pesan sungguhan di composer **saat run agen benar-benar
   berjalan**, lalu pesan itu benar-benar sampai ke model pada langkah berikutnya.
   Yang terbukti di sini hanya keputusan murninya (22 kasus) — bukan render panel,
   bukan toast, bukan panggilan provider.
2. **Panel antrean benar-benar merender baris yang diketik selagi sibuk** (`antrians`
   ditulis di branch sibuk; belum pernah dilihat di layar).
3. **Toast**: `Queue full (20): the oldest queued message was dropped, yours is in`,
   `A queued row had no text, so no turn was injected from it`, dan tolak kosong/panjang
   — teksnya belum pernah muncul di UI nyata.
4. **Tidak ada 400/penolakan provider** dari penyisipan giliran di tengah run. Alasan
   teoretisnya ada di §4.1, dan L18/L19 menjaga bentuk `history`-nya, tetapi tanpa app
   ini masih hipotesis.
5. **Perilaku Stop / run gagal bersama antrean baru** (sisa antrean sengaja tidak
   dijalankan) belum diuji dengan run nyata yang dibatalkan.
6. **Gambar** pada baris mengantre: catatannya diuji sebagai teks, tetapi tidak ada
   bukti app bahwa gambar itu memang tidak ikut ke request.

## 6. Cara menjalankan

```bash
cd D:/Zephyr
node scripts/uji-antrean-live.mjs     # == 22/22 lulus ==   (exit 0)
node scripts/uji-antrean-pesan.mjs    # == 18/18 lulus ==   (exit 0)
node scripts/uji-suntik-konteks.mjs   # == 17/17 lulus ==   (exit 0)
npx tsc --noEmit                      # 0 galat             (exit 0)
```

Ketiganya node-only: tanpa Tauri, tanpa jaringan, tanpa store. `src/lib/aiStore.ts`
sengaja **tidak** diimpor (zustand/React/Tauri); dua kasus di `uji-antrean-live.mjs`
(L8, L12) karena itu diberi label "simulasi drain" — potongan keputusan store yang
ditulis ulang sebagai perbandingan, dan ditandai jujur, bukan diklaim sebagai uji
berkas itu.

## Peta lane + sisa item — 2026-10-14 (rev. 91)

Status list kanonik: 193 item — **167 selesai, 26 sisa** (23 pending + 3 in_progress).
Lima item ditandai selesai HARI INI berdasar vonis harness nyata (bukan klaim lane):

| item | vonis | harness |
|---|---|---|
| zeph-blok-kondisional | 68/68 lulus | `uji-blok-kondisional.mjs` |
| zeph-keymap-merge-satu-chord | LULUS | `uji-keymap-chord-gabung.mjs` |
| zeph-retrieval-otomatis | LULUS | `uji-retrieval-otomatis.mjs` |
| zeph-tahu-100p | LULUS | `uji-tahu-100p.mjs` |
| zeph-versi-indeks-basi | 18/18 lulus | `uji-versi-indeks.mjs` (cap 1.1.13/f83cc022) |

Tambalan subset tool (dari lapisan lane sebelumnya) **sudah dipasang di produk**:
urutan prioritas wajib = dasar → web → tulis, dan keluarga yang mengalah dicatat di
`rumahDitahan` (bukan hilang diam-diam). Vonis: `cek-subset-tugas.mjs` LULUS (20 maks,
0 hilang, 0 nama rute hilang), `uji-subset-alat.mjs` 15/15 termasuk S11, `cek-cap-payload.mjs`
18/18. Kasus `panel`/web-murni kini 20 tool dan tetap membawa permukaan web; yang
mengalah `delete_file`.

Lane hidup (jangan dikirim ulang):

- `deleg_d037c104` sa-10 — ai-tahu-100-2-sisa, ai-tahu-100-7, ai-tahu-100-8
- `deleg_a1ebd70a` sa-2 — v4v12-izin-terminal (V4/V12 = cacat harness; sisa: run penuh 12/12)
- `deleg_b7a33b1e` sa-0 — versi-indeks (sudah berbuah, lihat tabel di atas)
- `deleg_b568001f` sa-0 — blok-kondisional + larangan-blok (sudah berbuah)
- `deleg_cbfe8b29` sa-0 — peran-subagent (harness baru 37/37, TAPI `uji-prompt-subagent2.mjs` masih 2/5 → sudah dikuasai balik: aturan harus masuk ke sumber yang benar, bukan cuma harness baru)
- `deleg_8886a7b5` (5 task, baru) — zeph-browser-builtin (tambalan celah B),
  zeph-fetch-web, zeph-provider-fallback, zeph-autocomplete-inline, zeph-baca-kode-sendiri

Sisa yang SENGAJA belum dilempar ke lane: `i18n-final`, `prompt8-bug-sisa`,
`prompt9-commit` (urutan terakhir / perlu lampu hijau pemilik), `a9`, `e2`
(kenyataan repo, bukan tugas), `pakai-subagent` (aturan pemakaian lane),
4 item LAMA (pane-uji, kurs, merah, besar — butuh app hidup), `zeph-bukti-live-app-tema`
dan sisi CDP `zeph-munculin-ui` (wajib dijalankan saat app idle, serial, bukan paralel).
`zeph-bahasa-noop-puppet` + `zeph-label-sudah-didukung` tinggal keputusan tampilan.
