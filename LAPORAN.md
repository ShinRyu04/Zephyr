# LAPORAN — Paritas "Experts Mode" Zephyr vs Qoder

Cabang: `feat/experts-qoder-ui` (worktree sandbox `D:\Zephyr-lab`).
Repo utama `D:\Zephyr` **tidak disentuh** (tidak ada commit/merge/push).
Keputusan akhir tetap milik user — laporan ini menyatakan apa yang berubah dan
apa yang **masih berbeda**, bukan klaim "sudah sama".

---

## 0. Keadaan lingkungan saat mulai (bukan bagian fitur)

Tiga hal ditemukan rusak sebelum satu baris kode Experts diubah, dan diperbaiki
secara netral (bukan perubahan produk):

| Temuan | Dampak | Tindakan |
| --- | --- | --- |
| `D:\Zephyr-lab\.git` hilang (git menganggap worktree `prunable`) | Semua perintah git gagal; riwayat cabang tidak bisa dibaca | ditulis ulang `gitdir: D:/Zephyr/.git/worktrees/Zephyr-lab` |
| 204 berkas terlacak terhapus (178 di antaranya `docs/`, sisanya dotfile: `.gitignore`, `AGENTS.md`, `.gitattributes`, `.github/`) | `git status` kotor; `AGENTS.md` (aturan repo) tidak terbaca agen | `git checkout -- .` (tidak ada perubahan `src/` yang hilang) |
| `node_modules` tidak lengkap (35 paket; `react`, CodeMirror, `@tauri-apps/*` hilang) | `tsc` mustahil lulus; app tidak bisa jalan | `npm install` dari `package-lock.json` yang ada (lockfile tidak diubah) |

---

## 1. Daftar kerja — status

| # | Permintaan | Status | Bukti / catatan |
| --- | --- | --- | --- |
| 1 | Ikon monokrom | **Selesai** | Blok "PARITAS QODER" di `src/styles/ai-experts.css`: ikon langkah, lipatan, kartu worker, avatar, strip, queue → `--text-muted`. Yang tetap berwarna: status hijau selesai, ikon `#` berkas, angka diff. |
| 2 | "Creating research task" = lipatan berisi pikiran Lead | **Selesai (kode), belum diuji provider nyata** | Rencana Lead kini **di-stream** (`src/lib/expertsStream.ts` + `ai_tool_chat_stream`), delta `reasoning` disimpan di `run.pikirMenyusun`, dirender di `CreatingResearchTask` (ChatMessage.tsx). |
| 3 | "Worked on it" jadi lipatan | **Selesai** | `KerjaFold` di `ExpertsTimeline.tsx`: caret + isi jumlah langkah tool & berkas yang disentuh. Tidak ada ringkasan karangan. |
| 4 | Catatan Lead berselang sesuai kronologi | **Selesai** | `CatatanLead.tugasId` diisi saat catatan dibuat; lipatan dirender setelah kartu worker itu. Catatan run lama (tanpa `tugasId`) tetap tampil di akhir. |
| 5 | Rentang baris pada Read | **Selesai** | `rentangBaca()` (expertsBuka.tsx) dari args `read_file` (`offset`/`limit`/`awal`/`akhir`). Bukti: `Read expertsStore.ts (37 - 120)`. |
| 6 | Angka diff `+n -n` di kartu berkas | **Selesai** | `perubahanTool.ts` menghitung `hitungBaris(sebelum, sesudah)` per tulisan → `ambilStatTerkini()` dibaca `subagentStore.ts` → `SubStep.tambah/hapus` → kartu. Tanpa perbandingan sah: tidak ada angka. |
| 7 | Ikon status (centang bulat, terminal ⊟, lipatan ⟳) | **Selesai** | `IkonCentang()` dipakai header tab Task & strip; ikon langkah dari `AiIkon` (monokrom). |
| 8 | Dimensi & spasi dari screenshot | **Sebagian** | Kolom chat penuh, kartu 10/12, judul 13px, nama/status 12px, baris langkah 30px/12.5px, strip 12px. Lihat §3 untuk selisih yang masih terlihat. |
| 9 | Tombol "…" pada "Message queued" | **Selesai** | `KartuAntreanExperts.tsx`: menu `…` berisi **Remove** (memakai `hapusSteer`). |
| 10 | Detail Task Progress | **Sebagian** | Centang bulat hijau / lingkaran kosong, judul selesai diredupkan, badge dijadikan teks polos "1/2 Done". Lihat §3. |
| 11 | Regenerasi indeks UI | **Selesai** | `node scripts/gen-fakta-zephyr.mjs` → commit tersendiri. |

---

## 2. Bukti visual (side-by-side)

Semua di `D:\Zephyr-lab\bukti\` (referensi **kiri**, Zephyr sandbox **kanan**):

- `banding-chat.png` — kartu chat + "Worked on it" + catatan Lead (ref 022540)
- `banding-tasktab.png` — tab Task 1 (ref 022709): rentang baca, `+1 -1 M Applied`, terminal, "✓ Completed"
- `banding-strip.png` — Task Progress (ref 110036)
- `banding-queue.png` — "Message queued 1" + "…" (ref 064955)

Data demo **bukan** dari sesi user. `scripts/bukti-experts.mjs` membuat sesi
baru sendiri, mengisi run/tugas/langkah sintetis, memotret, lalu **menghapus
hanya sesi itu** dan mengembalikan `activeId`/`activeIds` user seperti semula.
Tidak ada panggilan provider berbayar.

Catatan proses: versi pertama skrip ini salah mengikat panel (hanya `activeId`,
padahal `AiPanel` memakai `activeIds[composerId]`), sehingga potret pertama
menampilkan **sesi user yang lain**. Gambar itu dibuang, skrip diperbaiki,
dan sekarang memverifikasi isi elemen sebelum menyimpan.

---

## 3. Selisih yang MASIH ada (jujur — user yang menilai)

1. **Teks token/biaya di header strip.** Zephyr menampilkan `↑/↓` token (dan
   biaya bila tarif diketahui); Qoder tidak. Ini data yang Qoder memang tidak
   punya, bukan gaya. **Perlu keputusan user**: dipertahankan atau disembunyikan.
2. **Kontainer langkah di tab Task.** Di 022709 baris langkah duduk dalam blok
   berlatar sedikit lebih terang dengan sudut membulat; di Zephyr masih rata
   pada latar tab. Ukuran/spasi sudah disamakan, latar blok belum.
3. **Ikon kartu berkas.** Acuan memakai `#` untuk CSS; Zephyr memakai ikon
   dokumen generik (monokrom). Angka diff, `M`, dan `Applied` sudah sama.
4. **Tombol Stop** muncul di strip karena run demo berstatus berjalan; acuan
   memotret run yang sudah selesai. Bukan selisih gaya.
5. **Lipatan "Creating research task" belum terbukti dengan model nyata.**
   Jalur stream sudah memakai `ai_tool_chat_stream` (delta `reasoning` ada di
   `ai.rs:1700`), tetapi saya **tidak** memanggil provider berbayar untuk
   membuktikan paragrafnya muncul. Bila model/provider tidak mengirim
   reasoning, lipatan hanya menampilkan header — itu perilaku yang benar
   (tidak mengarang teks), tetapi belum diverifikasi di lapangan.
6. **Font** tetap font Zephyr (satu-satunya pengecualian yang disepakati).

---

## 4. Bug di luar lingkup yang ditemukan

- **`KartuProgresExperts.tsx` — penjaga token.** `if (masuk !== null)` juga
  lolos untuk `undefined`, sehingga baris yang belum melaporkan pemakaian
  menjumlahkan `NaN` dan strip menampilkan `$NaN · NaNM↑ NaNM↓`.
  **Diperbaiki** (`typeof === 'number'`) karena strip ini memang sedang
  disamakan (item 10) dan tampilannya langsung salah karenanya.
- **`scripts/lib-cdp.mjs` + prelude `runAsync`.** Prelude sudah mendeklarasikan
  `S`, `EX`, dsb.; skrip yang menyalin nama itu gagal `SyntaxError`. Hanya
  memengaruhi harness baru (sudah dihindari), bukan produk.

---

## 5. Verifikasi yang benar-benar dijalankan

- `node node_modules/typescript/lib/tsc.js --noEmit` → **exit 0, 0 error**
  (dijalankan setelah semua perubahan terakhir).
- App dev (`npm run tauri dev`) hidup dengan CDP 9223; empat permukaan
  dipotret dari app yang benar-benar berjalan (§2).
- **Tidak** dijalankan: suite `verify:*` fase lain, uji provider nyata,
  uji dua-jendela. Tidak ada klaim lulus untuk hal yang tidak dijalankan.

---

## 6. Commit di cabang sandbox

```
11f9b16 feat(experts): ikon monokrom + dimensi dari screenshot Qoder
0148250 feat(experts): pikiran Lead nyata, lipatan Worked on it, catatan berselang
a473a11 feat(experts): rentang baris Read + angka diff pada kartu berkas
07826b4 feat(experts): ikon status strip + menu titik-tiga pada antrean
d72bcf6 chore(experts): regenerasi indeks fakta/UI Zephyr
```
Ditambah commit untuk selisih yang ditemukan dari bukti (badge strip polos,
laporan tab tanpa bingkai, penjaga NaN) dan harness bukti.

**Belum di-merge ke `D:\Zephyr`** dan tidak di-push — menunggu keputusan user.
