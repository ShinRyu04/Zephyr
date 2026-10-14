# ANTREAN PESAN AGEN — aturan antrean dan sambungannya ke giliran agen

Catatan ini ditulis dari **isi kode nyata** (`berkas:baris`), bukan dari ingatan.
Angka uji diambil dari menjalankan harness.

| Berkas | Peran |
| --- | --- |
| `src/lib/antreanPesan.ts` (322 baris) | aturan antrean sebagai fungsi murni |
| `scripts/uji-antrean-pesan.mjs` | harness antrean — **18/18 lulus** |
| `src/lib/suntikKonteks.ts` (BARU) | memakai `KeadaanAntrean` apa adanya sebagai blok pesan yang **tidak boleh hilang** |
| `scripts/uji-suntik-konteks.mjs` (BARU) | membuktikan pesan antrean bertahan & tidak dobel antar giliran — **17/17 lulus** |
| `docs/ANTREAN-DAN-KONTEKS.md` | catatan rancangan lane sebelumnya (jangan ditimpa) |

---

## 1. Masalah yang dijawab antrean

User mengetik pesan kedua selagi agen masih bekerja. Tiga pilihan buruk yang
semuanya **pernah terjadi** (ditulis di kepala berkas `antreanPesan.ts:1-24`):

1. pesan kedua **menabrak** giliran yang sedang jalan;
2. pesan kedua **dibuang diam-diam** (user merasa sudah mengirim, tidak ada
   jejaknya di mana pun);
3. urutan keluarnya acak sehingga "lanjutkan" keluar sebelum perintah yang
   sebenarnya diminta lebih dulu.

(Semua tiga itu tertulis di kepala berkas, `src/lib/antreanPesan.ts:4-14`;
kontrak resminya ada di `:16-24`.)

## 2. Kontrak nyata (dibaca dari kode)

| Aturan | Rujukan |
| --- | --- |
| Agen **tidak** sibuk → pesan langsung dikirim (`masukAntrean: false`) | `src/lib/antreanPesan.ts:17`, `:112` |
| Agen **sibuk** → pesan masuk antrean, giliran yang jalan tidak diganggu | `src/lib/antreanPesan.ts:18`, `:112` |
| Giliran selesai → pesan **paling depan LANGSUNG diproses**, sisanya menunggu | `src/lib/antreanPesan.ts:19`, `:187` |
| Tiap pesan punya `id` stabil, jadi bisa dibatalkan walau urutan berubah | `src/lib/antreanPesan.ts:20`, `:36` |
| Semua fungsi mengembalikan keadaan BARU, argumen tidak diubah | `src/lib/antreanPesan.ts:22-23` |
| Batas jumlah menunggu = **20** | `src/lib/antreanPesan.ts:61` |
| Batas panjang satu pesan = **8192** karakter (`8 * 1024`) | `src/lib/antreanPesan.ts:64` |
| Sebab penolakan: `kosong` \| `terlalu-panjang` \| `penuh` | `src/lib/antreanPesan.ts:84` |

`id` **bukan indeks array** (`src/lib/antreanPesan.ts:29-33`): baris antrean bisa
dinaikkan/diturunkan/dipromosikan, jadi indeks yang sama bisa menunjuk pesan
berbeda setelah reorder — pembatalan harus mengikuti pesannya, bukan posisinya.

API lengkap (semua di `src/lib/antreanPesan.ts`):

```
buatAntrean :73    kirim :112        giliranMulai :162   giliranSelesai :187
jumlah :204        kepala :209      ada :213            batalkan :231
kosongkan :250     naikkan :279     turunkan :283       promosikan :288
ubah :300          ringkasTeks :320
```

## 3. Bagaimana antrean masuk ke SATU giliran agen

`src/lib/suntikKonteks.ts` menerima `KeadaanAntrean` **utuh** sebagai argumen
(`BahanGiliran.antrean`) dan sengaja **tidak** menyalin bentuknya sendiri — kalau
bentuknya disalin, aturan antrean (id stabil, urutan hasil `promosikan`, batas 20)
harus ditulis dua kali dan cepat atau lambat akan berbenturan.

| Sifat | Kenapa begitu |
| --- | --- |
| Pesan antrean = blok `wajib: true` | pekerjaan yang belum selesai tidak boleh hilang saat anggaran ukuran habis |
| Urutan mengikuti `keadaan.daftar` apa adanya | keputusan user (mis. `promosikan`) tidak boleh di-sort ulang mesin |
| Pesan antrean ditempatkan **sebelum** permintaan giliran ini | "yang tadi diminta" dibaca lebih dulu, permintaan sekarang menutup giliran |
| Pesan antrean yang `id`-nya sama dengan permintaan sekarang **digabung** | keadaan bisa basi (permintaan sudah ditarik dari antrean oleh pemanggil yang lain) — pesan yang sama tidak boleh jadi dua |
| Antrean berisi pesan padahal `sibuk=false` | tetap dibawa, tapi dilaporkan sebagai peringatan: pengosongan antrean perlu diperiksa |

## 4. Angka uji (dijalankan 14 Okt 2026)

```
$ node scripts/uji-antrean-pesan.mjs | tail -2
== 18/18 lulus ==

$ node scripts/uji-suntik-konteks.mjs | tail -2
== 17/17 lulus ==
```

Kasus antrean di harness penyusunan giliran:

| Kasus | Yang dibuktikan |
| --- | --- |
| S3 | dua pesan mengantre keluar berurutan, permintaan sekarang tetap paling akhir |
| S8 | **dua giliran berturut-turut**: giliran-1 membawa 2 pesan antrean; giliran-2 membawa "PESAN-KEDUA" **1×** (sebagai permintaan, bukan pengulangan) dan "PESAN-KETIGA" 1× sebagai antrean |
| S9 | permintaan yang `id`-nya masih ada di antrean (keadaan basi) muncul **1×**, bukan dua |
| S10 | anggaran 200 byte dilewati, tapi `ANTREAN-PENTING` & `TUGAS-BELUM-BERES` tetap ada utuh |
| S14 | urutan hasil `promosikan` dipertahankan (`antrean:p3-1h -> p1-1f -> p2-1g`) |
| S17 | jumlah gambar dilaporkan (2 di antrean, 1 di permintaan) tanpa menyalin data gambarnya ke teks |

## 5. Yang BELUM tersambung (jangan diklaim sudah)

- **Antrean di `aiStore.ts` adalah mekanisme LAIN, bukan `antreanPesan.ts`.**
  `grep antrean src/lib/aiStore.ts` = **51 kemunculan** (14 Okt 2026), semuanya
  milik jalur sendiri:

  | Tempat | Isi |
  | --- | --- |
  | `src/lib/aiStore.ts:2460`, `:2497` | keadaan `antrians: Record<string, AntrianPesan[]>` dan `antrian: AntrianPesan[]` |
  | `src/lib/aiStore.ts:2778`, `:2801` | aksi `buangAntrian` / `kirimAntrian` |
  | `src/lib/aiStore.ts:3382` | `kirimAntrian: async (idx, composerId = '')` — pengambilan dari antrean |
  | `src/lib/aiStore.ts:7398-7402` | giliran sukses → pesan depan antrean langsung dikirim |
  | `src/lib/aiStore.ts:7409-7421` | giliran gagal/dibatalkan → antrean **tidak** dikuras, cuma toast: `"… pesan masih menunggu di antrean karena langkah sebelumnya … Kirim manual kalau sudah siap."` |

  Jadi antrean sudah ada di aplikasi, tapi **aturannya tidak dipakai bersama**:
  batas 20 pesan / 8192 karakter per pesan (`src/lib/antreanPesan.ts:61`, `:64`),
  `id` stabil (`:29-34`), dan `giliranSelesai` (`:187`) **tidak** berlaku di jalur
  `aiStore.ts` itu. Menyatukannya berarti mengganti pemakaian `AntrianPesan`
  dengan `KeadaanAntrean` — usulannya (berkas+baris+diff) ada di
  `docs/USULAN-SUNTIK-KONTEKS.md`, **belum dikerjakan** di lane ini karena
  `aiStore.ts` milik lane lain.
- Riwayat yang dibawa ke giliran agen cuma **dua pesan terakhir**:
  `src/lib/aiStore.ts:5038-5045` (`prevSemua` lalu `prev = prevSemua.slice(-2)`).
  Ini jalan pintas yang wajar untuk obrolan, tapi berbahaya untuk tugas: kalau
  tugas diset tiga pesan lalu, ia **tidak terbawa** dan tidak ada yang
  melaporkannya. Justru itu `suntikKonteks.ts` memisahkan `tugasBelumSelesai`
  dari riwayat.
- Sumber "tugas belum selesai" yang sudah ada di store: `agentTodos`
  (`src/lib/aiStore.ts:2604`), dipakai sebagai
  `agentTodos.filter((t) => t.status !== 'done')` di `:5380`, `:6117`, `:6926`.
- Penghubungannya (baris + diff, belum diterapkan) ada di
  `docs/USULAN-SUNTIK-KONTEKS.md`.
