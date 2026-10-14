# USULAN VONIS IZIN — sisa pekerjaan setelah harness dibetulkan

Tanggal: 2026-10-14 · Pasangan: `docs/LAPORAN-VONIS-IZIN.md`
Sisa: **5 harness belum dijalankan** (butuh app) + **1 cacat produk terbuka** (C1 append). Keduanya di bawah, apa adanya — tidak ada yang disembunyikan atau diberi label "beres".

## 1. Tutup celah butuh-app: jalankan dengan app hidup

Setelah perbaikan, runner jujur berhenti di `SEBAGIAN TIDAK DIUJI (exit 2)`. Untuk **exit 0**, matikan dulu agen/lane lain yang menyunting `src/**`, hidupkan app, lalu:

```
node scripts/uji-izin-semua.mjs
```

Yang akan dijalankan (semuanya harness CDP :9223):

| Harness | Yang dibuktikan | Risiko kalau tidak pernah dijalankan |
|---|---|---|
| `verify-tool-gate` | G1–G7: sekat default = `TOOL_AKTIF_AWAL`, pasang/lepas grup tidak mengubah jumlah di luar harapan | sudah diperbaiki statis (nama ekspor), tapi jalur live belum terbukti |
| `verify-tool-inti` | tool inti tetap terkirim & bisa dipanggil setelah pemangkasan | regresi jalur kirim bisa lolos |
| `uji-trim-tool` | pemangkasan nyata di app tidak membuang kemampuan yang dijanjikan prompt | sama |
| `cek-aturan-operasional` | aturan operasional prompt ↔ katalog nyata | sama |
| `uji-batas-tulis` | batas tulis/approval | sama |

**Usul konkret (kecil, menghilangkan ketergantungan pada daftar manual):** setiap harness yang menyentuh CDP membungkus `Cdp.attach` dengan guard yang sama seperti `verify-tool-gate.mjs:20-40` (`try/catch` → cetak `BUTUH APP: … (sebab)` → `exit 2`) dan `cek-aturan-operasional.mjs:22-25`. Dengan begitu runner bisa mengklasifikasi ulang lewat `PENANDA_BUTUH_APP` (`uji-izin-semua.mjs:138`) **walaupun** seseorang lupa menambahkannya ke daftar `BUTUH_APP` — daftar jadi kenyamanan, bukan satu-satunya kebenaran.

## 2. Cacat produk terbuka: `append` tidak punya rumah (C1)

Status apa adanya: `uji-kesiapan-tool.mjs` (c) melaporkan
`tambah isi (append) - celah C1 (docs/AUDIT-TOOL-BERKAS-2026-10-14.md §5)`,
dan `write_file` **selalu menimpa**. Append hari ini hanya bisa ditiru lewat `bash_run` (redirect `>>`) — itu jalan pintas, bukan rumah.

**Usul penutup (mengikuti keputusan pemilik, tanpa tool baru):**

- **Rumahnya `write_file`, modenya parameter.** Tambah parameter `mode: 'overwrite' | 'append'` (default `'overwrite'` — perilaku hari ini tidak berubah) di `write_file`, dijalankan `fs_utils.rs` dengan `OpenOptions.append(true)`. Ini mengikuti keputusan (3) "default = parameter, bukan tool baru" dan (4) "satu kemampuan satu rumah" (`write_file` tetap satu-satunya rumah tulis berkas).
- **Bukan** `append_file`/`write_file_append`/`edit_append` sebagai tool baru: keputusan (2) melarang menambah tool tanpa tugas nyata yang **gagal**. Tugas "menambah isi ke berkas" memang gagal hari ini, tetapi penutup termurahnya adalah parameter, bukan rumah baru.
- **Verifikasinya sudah setengah siap.** `uji-kesiapan-tool.mjs` bagian (c) sudah mencari rumah `append_file|write_file_append|edit_append`; kalau ditutup lewat `mode`, operasi itu perlu satu penyesuaian: daftarkan rumahnya `write_file` + `wajibParam: { mode: ['append'] }`, sehingga (c) menuntut **nama tool DAN nama parameter** ada — bukan sekadar "ada tool tulis". Ini usulan, belum dikerjakan, dan sengaja tidak dikerjakan sebelum ada keputusan pemilik.
- **Sampai diputuskan, jalur `celahDiketahui` tetap ada** dan akan otomatis berteriak begitu celahnya tertutup:
  `CATATAN: celah C1 … kini PUNYA rumah - perbarui bagian (d) dan dokumen celah.` Artinya kalau penutupnya dikerjakan di lane lain, tidak ada yang bisa menyelesaikannya diam-diam.

## 3. Fakta yang perlu keputusan pemilik (bukan cacat, tapi batas)

- **Margin cap = 0 di tugas berat.** Jalur kirim nyata mengirim **tepat 20** tool pada 4 dari 6 tugas nyata (basis aktif-default maupun katalog penuh; lihat `LAPORAN-VONIS-IZIN.md` §4.3). Artinya tidak ada ruang untuk menambah apa pun ke jatah per giliran tanpa memangkas yang lain. Usul: biarkan 20 (keputusan 1) dan tempel fakta ini di `AUDIT-TOOL-BERKAS-2026-10-14.md` supaya usulan "tambah tool kelas X" berikutnya langsung terlihat harganya.
- **`uji-batas-tulis` juga butuh app** tapi tidak disebut di daftar merah awal — sudah benar sejak dulu di `BUTUH_APP`. Tidak ada perubahan.

## 4. Aturan main yang diusulkan untuk vonis berikutnya

1. **`DIKENAL_MERAH` kosong = sehat.** Setiap entri baru **wajib** menyebut (a) berkas:baris akar, (b) dokumen yang mencatatnya, (c) bukti keluaran. Entri yang tidak bisa menyebut ketiganya adalah merah biasa, bukan "dikenal".
2. **exit 2 dipakai untuk "tidak bisa diukur", bukan untuk "agak merah".** Harness boleh keluar 2 hanya kalau penyebabnya ketidakmampuan mengukur (app mati / prasyarat hilang), dan alasannya wajib tercetak dengan penanda `BUTUH APP:` atau `TIDAK BERLAKU:`.
3. **Jangan melunakkan tuntutan lama tanpa bukti salah sasaran.** `alatUntukTugas` memang tanpa cap (bukti: `subsetAlat.ts:181-204` mengembalikan himpunan `aktif`; cap dituntut `subsetTugas.ts:638`) — itulah dasar kenapa tuntutan ≤20 di harness lama dipindah ke jalur `pilihToolTugas`. Tuntutan lama tetap dicetak sebagai kolom `DIAGNOSTIK-tanpa-cap`, jadi penurunan angkanya tetap terlihat dan tidak hilang dari sejarah.
