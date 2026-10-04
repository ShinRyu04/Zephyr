# Jebakan: `git stash pop` setelah perintah terputus - sebagian file senyap kembali

Ditulis 2026-10-04. Berlaku untuk SEMUA sesi, bukan cuma yang ini.

## Yang terjadi

Untuk membandingkan regresi, saya menjalankan:

    git stash push <10 path> ; node scripts/verify08.mjs ; git stash pop

Perintah itu **terputus di tengah** (user menekan berhenti). Kenyataannya:
`git stash push` sudah selesai, `verify08` tidak pernah jalan, `git stash pop`
tidak pernah jalan.

Lalu saya cek `git stash list`, lalu jalankan `git stash pop "stash@{0}"` secara
manual. Saya laporkan "semua perubahan saya utuh" - dan itu **SALAH**.

Bukti yang saya pakai saat itu tidak memadai:
- `npx tsc --noEmit` bersih
- `git status` menunjukkan aiStore.ts termodifikasi
- penanda khas di aiStore.ts berjumlah 27

Semuanya benar, tapi tidak satu pun menyentuh berkas lain. Hasil sebenarnya:

| Berkas | Dinyatakan utuh? | Kenyataan |
|---|---|---|
| aiStore.ts, contextBudget.ts, ai.rs | ya | benar |
| tediTools/builtins.ts + catalog.ts + deskripsiTool.ts | ya | **HILANG** |
| styles/tokens.css, styles/ai-streaming.css | ya | **HILANG** |
| 3 harness (todo-card, kapsul, kontrak-40) | ya | **HILANG** |

`git status` memang menampilkan berkas itu sebagai tidak termodifikasi - jadi
"tidak termodifikasi" yang saya baca sebagai "tidak berubah" padahal artinya
"sudah kembali ke HEAD".

## Cara memastikan yang benar

Bukan `tsc` dan bukan satu marker. Yang benar:

    git status --short                 # daftar berkas yang TIDAK muncul = dicurigai
    git stash show --name-only "stash@{N}"   # isi stash yang diklaim dipulihkan
    git diff --stat                     # hanya akan menampilkan yang ada

Dan untuk memastikan isi berkas, bukan status git-nya - cari penanda unik per
berkas, satu perintah untuk semua:

    foreach ($f in @('src/.../a.ts','src/.../b.css')) {
      "$f => " + (Select-String -Path $f -Pattern 'penanda-khas' -Quiet)
    }

Kalau RESULTS itu keluar kosong untuk berkas yang seharusnya punya penanda,
berkas itu sudah kembali ke HEAD - bukan "bermasalah".

## Pelajaran

**"Dipulihkan" adalah klaim, bukan fakta.** Dan pemeriksaan yang tidak menyentuh
berkas yang dimaksud tidak bisa membuktikannya: `tsc` bersih pada berkas yang
sudah kembali ke HEAD, sama siftinya dengan berkas yang baik. Yang membuat ini
berbahaya: semuanya tampak benar (memang iya semua yang dicek benar), jadi
tidak ada yang memicu kecurigaan.

Aturan yang dipakai sekarang:

1. **Dilarang `git stash` untuk membandingkan baseline.** Kalau memang perlu,
   buat salinan: `Copy-Item -Recurse` ke folder sementara. Tidak ada yang bisa
   hilang, dan tidak ada perintah gabungan yang bisa terputus di tengah.
2. Kalau stash terlanjur dipakai, hitung daftar berkas SEBELUM dan SESUDAH,
   lalu bandingkan daftar itu - bukan=status yang terlihat "bersih".
3. Setiap klaim "semua perubahan saya utuh" wajib menyertakan hitungan per
   berkas, bukan satu agregat.

## Jejak lain dari sesi ini yang sama regulatorsnya

Perintah gabungan `a ; b ; c` yang panjang dan berurutan **berbahaya**: saat
berhenti di tengah, tidak ada yang memberi tahu apa yang sudah jalan. Nilai
default yang benar: satu perintah satu tujuan, lalu cek hasilnya. Itu juga
alasan `verify08.mjs` tidak pernah jalan - dan kesimpulannya (3 uiji gagal)
berbahaya kalau nanti dipakai sebagai "sebelum".

## Harness yang terlalu renderer-sensitif

Tiga harness (verify-todo-card, cek-kapsul-hermes, cek-kontrak-40) gagal setelah
DPR 1.25 + struktur baru. Dua sebab yang berbeda:

1. **Salah tingkat diukur.** `.composer-status-stack` (section dalam, radius 0
   by design) diukur sebagai ganti `.ai-work-stack` (kartu luar, radius 10px).
   Kode benar, harness salah.
2. **DPR bukan 1.** `1px` terbaca `0.8px`, `10px` terbaca `8px`. Persamaan
   persis menolak keadaan yang benar. Selalu banding toleransi.

Dan jebakan ketiga, yang paling mahal: **panel AI tidak ter-render sampai
dibuka** (`dock = 'ai'`). Store benar, DOM tidak ada, harness menyimpulkan
"tidak ada". Perbaikan: harness membuka panel sendiri secara IDEMPOTEN
(cek `.ai-send-wrap` dulu, baru klik) - klik buta akan menutup panel yang
kebetulan sudah terbuka.