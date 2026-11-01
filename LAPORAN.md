# LAPORAN — Paritas "Experts Mode" Zephyr vs Qoder

Cabang: `feat/experts-qoder-ui` (worktree sandbox `D:\Zephyr-lab`).
Repo utama `D:\Zephyr` **tidak disentuh** (tidak ada commit/merge/push).
Keputusan akhir tetap milik user — laporan ini menyatakan apa yang berubah dan
apa yang **masih berbeda**, bukan klaim "sudah sama".

---

## 0.0. Babak 3 — 2 Nov (to-dos & antrean, permintaan langsung user)

Keluhan user: (a) to-dos "sering ketimbun sendiri", apalagi saat kartu
dikecilkan; (b) antrean: pesan yang dikirim "malah chat sebelumnya yang
lanjut" dan antrean "kayak gada gunanya sama sekali".

Akar & perbaikan (semua terbukti di app hidup, bukan tebakan):

| Masalah | Akar | Perbaikan |
| --- | --- | --- |
| To-dos ketimbun | `setAgentTodos` sengaja "hanya bisa bertambah": rencana baru menumpuk di atas rencana lama, entri berteks sama jadi dua baris (simulasi: rencana 3 item jadi 8, entri dobel jadi 5) | Dedup per teks + deteksi rencana PENGGANTI (semua entri bawa teks baru → daftar lama diganti). Update parsial tetap aman — yang tidak disebut dipertahankan |
| To-dos vs Queue "di 1 slot" | AiPanel ternary: antrean menang, to-dos hilang | Keduanya dirender berdampingan seperti Qoder (064955); masing-masing bisa dikecilkan tanpa menghilangkan tetangga |
| "Chat sebelumnya yang lanjut" | Jalur antrean-live menyuntikkan pesan ke TENGAH run yang sedang jalan (di awal tiap langkah) | Jalur dihapus: antrean MENAHAN pesan sampai giliran selesai; drain akhir giliran mengirim sebagai giliran BARU. Run dibatalkan/gagal tetap tidak men-drain |
| Panel mati saat antrean dipakai | `KartuAntrean.tsx` membaca `a.images.length` tanpa penjaga — baris antrean tanpa properti images menjatuhkan seluruh panel ke error boundary | `images?.length ?? 0`; baris tanpa lampiran = tanpa chip gambar |

Commit: `6b28c34` (antrean menahan), `e205e38` (penjaga to-dos + slot
berdampingan), `9370ed0` (penjaga images). `npx tsc --noEmit` 0 error.

Bukti:
- `bukti/app-todos-queue.png` — To-dos 2/6 + "Message queued 2" berdampingan.
- `bukti/app-todos-kecil.png` — To-dos dikecilkan, antrean tetap tampil.
- `scripts/uji-todos-cari.mjs` — simulasi S1–S4 via CDP; setelah perbaikan:
  rencana baru = daftar bersih (3), entri dobel = 1 baris.
- `scripts/bukti-todos-queue.mjs` — potret dengan sesi demo sendiri
  (keadaan user dikembalikan apa adanya).

Verifikasi tambahan:
- `verify-antrean-komposer.mjs`: **5/7** lulus. Q1 (mengantre tidak membatalkan
  run), Q3 (draft dikosongkan), Q4 (lane chat sama), Q5 (lane per permukaan),
  Q7 (drain ganda tidak dobel) — jalur yang disentuh perubahan ini lulus.
  **Q2 & Q6 GAGAL SEBELUM perubahan ini**: harness menunjuk
  `[data-testid="ai-review"]`, panel review yang sudah TIDAK ADA di produk
  (grep `src/` = nol). Harness kadaluarsa, bukan regresi — tidak diperbaiki
  diam-diam, menunggu keputusan.

---

## 0.1. Babak 2 — 2 Nov 2026 (sesi ini)

Lanjutan atas 11 poin yang babak pertama selesaikan. Babak ini menutup sisa
§3 babak pertama dan menyeterukan permukaan ke **referensi baru 1 Nov**
(`Screenshot 2026-11-01 035349/035406/044850/044920/044947.png` — pola Lead
kronologis: lipatan Creating → Created → kartu → Worked on it → catatan Lead
"Updating task approach" TERBUKA).

| Perubahan | Berkas | Acuan |
| --- | --- | --- |
| Ikon kartu berkas tab Task = ikon TIPE berwarna (material-icon-theme) | `ExpertsTaskTab.tsx` | 022709 `#` biru CSS, 022721 ikon React |
| Kontainer langkah berlatar + garis atas-bawah halus; kartu berkas/terminal lebih terang lagi | `ai-experts.css` | 022709/022721 |
| **Lipatan "Creating research task" permanen** — dulu hilang begitu streaming selesai; kini tampil sepanjang usia pesan (spinner → ikon statis), isi paragraf pikiran Lead | `ChatMessage.tsx` | 035349/044920 (run SUDAH berjalan, lipatan masih di atas) |
| Catatan Lead TERAKHIR kronologis terbuka (dulu hanya catatan tanpa `tugasId` yang bisa terbuka) | `ExpertsTimeline.tsx` | 035349 "Updating task approach ⌄" terbuka |
| Glyph caret `▾` 9px (tampak seperti titik) → **chevron SVG tipis** di semua lipatan Experts | `expertsBuka.tsx` + 4 pemakai | 035349 "⌄" |
| Ikon langkah Thought = loop `⟳` (dulu sparkle) | `expertsBuka.tsx` | 022721 |
| "✓ Completed" header tab Task = **hijau** (dulu aksen biru) | `ai-experts.css` | 022709/022721 |
| Titik selesai strip = **hijau** (dulu biru; blok paritas menimpa aturan dasar — dua-duanya dibetulkan) | `ai-experts.css` | 110036 |
| "Failed"/"Cancelled" kartu chat = abu terang (dulu kuning `--warn`) | `ai-experts.css` | 035406 "Failed" |
| Badge "1/2 Done" = teks polos weight 400 | `ai-experts.css` | 035349 |
| Target langkah abu menyatu; hitungan "N results" INLINE setelah target (dulu terang di ujung kanan) | `ai-experts.css` | 022721 |
| Skrip bukti: setel mode `experts` sementara (dikembalikan), potret lipatan Creating + pesan Lead utuh | `scripts/bukti-experts.mjs` | — |

`npx tsc --noEmit` → 0 error setelah setiap commit.

### Bukti side-by-side (referensi kiri, Zephyr kanan) — dibangun ulang 2 Nov

- `banding-created2.png` — **044920 vs pesan Lead utuh**: Creating research task
  terbuka + paragraf → Created N tasks → kartu → Worked on it → catatan terbuka.
- `banding-created.png` — 044850 vs lipatan Creating research task.
- `banding-tasktab.png` — 022709 vs tab Task: kontainer langkah berlatar,
  Thought ⟳ + durasi, Read + rentang, count inline, kartu berkas ikon tipe,
  "✓ Completed" hijau.
- `banding-strip.png` — 110036 vs Task Progress: titik hijau, judul selesai
  redup, "1/2 Done" polos.
- `banding-chat.png` (022540) dan `banding-queue.png` (064955) — dibangun ulang
  dengan chevron baru.

### Yang sengaja dibedakan (babak 2)

- **Chip "Steering · run berjalan"** di atas Task Progress — Zephyr punya,
  Qoder tidak menampilkannya sebagai chip. Dipertahankan: tanpa itu pesan
  berikutnya diam-diam jadi steering dan user tidak punya penanda.
- **Tombol Stop** di strip saat run jalan — acuan memotret run yang sudah
  selesai, bukan larangan gaya.
- **Teks narasi Lead** berbahasa Indonesia (font Zephyr) — pengecualian yang
  disepakati.

### Yang BUTUH KEPUTUSAN USER (babak 2, menambah §3 babak 1)

1. **Token/biaya di header strip** (`↑/↓`, `$`) — TIDAK ada di acuan apa pun
   (30 Okt maupun 1 Nov). Belum disentuh sampai user memutuskan: sembunyikan
   (ikuti acuan penuh) atau pertahankan (data yang Qoder tidak punya).
2. **Bukti stream reasoning dengan model hidup** — lipatan sudah terbukti
   MERENDER paragraf (data store). Jalur Rust `ai_tool_chat_stream` → event →
   `pikirMenyusun` belum terbukti dengan model nyata karena semua jalur uji
   butuh kuota user ATAU menyetel provider mock (menyentuh Settings/secrets —
   dilarang aturan keras #3). Kalau user setuju setel provider mock sementara
   (`scripts/mock-ai.mjs` + `reasoning_content` di delta), bisa dibuktikan
   tanpa kuota.
3. **Dispatch tugas di TENGAH run** (035406: "Created 1 tasks" muncul KEDUA
   kali untuk Task 2 di tengah transkrip) — mesin Zephyr mendispatch semua
   tugas di awal run; fold kedua itu butuh perubahan MESIN (Lead boleh
   menambah tugas di tengah), bukan permukaan. Belum dikerjakan — menunggu
   keputusan karena mengubah perilaku run, bukan hanya tampilan.

### Commit babak 2 (sandbox, belum di-merge/push)

```
4550906 fix(experts): ikon tipe berkas pada kartu berkas + kontainer langkah berlatar
2bee77b feat(experts): lipatan Creating research task permanen + chevron SVG + Thought ⟳
554bad5 fix(experts): warna & tata baris mengikuti acuan — hijau selesai, gagal abu
9123234 fix(experts): titik selesai strip hijau — blok paritas menimpa aturan dasar
+ commit regen indeks & bukti babak 2
```

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
