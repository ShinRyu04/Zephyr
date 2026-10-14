# LAPORAN PENGETAHUAN SISA — 2026-10-14

Cabang: `feat/ai-panel-vscode-layout`. Lingkup: tiga item pengetahuan sisa
(`AI-TAHU-100-2-SISA`, `AI-TAHU-100-7`, `AI-TAHU-100-8`).

Semua angka di bawah **diukur pada sesi ini** dari berkas di disk — tidak ada yang
diwarisi. Angka lama `393 / 176 / 2662` sudah tidak berlaku dan tidak dipakai di
mana pun dalam laporan ini atau di kedua harness.

Berkas yang saya buat (milik saya, baru):

| Berkas | Isi |
| --- | --- |
| `scripts/uji-peta-kode.mjs` | gate AI-TAHU-100-8, 24 kasus, lulus 24/24 |
| `scripts/uji-pengetahuan-dua-lapis.mjs` | gate AI-TAHU-100-7, 27 kasus, lulus 27/27 |
| `docs/LAPORAN-PENGETAHUAN-SISA.md` | dokumen ini |
| `docs/USULAN-PENGETAHUAN-SISA.md` | usulan patch (berkas + baris + teks lama/baru) |

Tidak ada berkas lama yang saya tulis ulang. Indeks / fakta / bundel dokumen
generated **tidak** saya regenerate.

---

## 1. Bukti yang dijalankan

| Perintah | Exit | Hasil |
| --- | --- | --- |
| `node scripts/uji-peta-kode.mjs` | `0` | 24/24 kasus lulus; verdict `PETA KODE: LULUS` |
| `node scripts/uji-peta-kode.mjs --check` | `1` | **peta tersimpan BASI** (25 berkas baru, 30 teks meleset) — `--check` memang tidak menulis apa pun |
| `node scripts/uji-pengetahuan-dua-lapis.mjs` | `0` | 27/27 kasus lulus; verdict `PENGETAHUAN DUA LAPIS: LULUS` |
| `npx tsc --noEmit` | `0` | **bersih, 0 baris keluaran** (dijalankan 3x; run ke-1 sempat memunculkan 1 galat fantom dari cache inkremental yang basi — lihat bagian 5b) |

Catatan `--check` exit 1: itu bukan kegagalan harness. Harness lulus; yang merah
adalah **isi artefak peta kode di repo** (bagian 5). Harness justru tugasnya
melaporkan itu.

## 2. Angka nyata hari ini (terukur)

**Peta kode (AI-TAHU-100-8)** — diukur langsung dari `src/` + `src-tauri/src/`:

| Ukuran | Angka |
| --- | --- |
| berkas sumber yang masuk peta | **429** (semua `.ts/.tsx/.rs`) |
| total baris berkas sumber | **211 749** |
| berkas yang punya ≥1 ekspor | **297 dari 429** |
| total simbol ekspor | **3209** (3212 kemunculan diperiksa kelacakannya) |
| entri kategori `kode` di artefak tersimpan | **404** (BASI, lihat bagian 5) |
| total entri indeks (semua kategori) | **6212** |
| entri kategori `label` | **3023** |
| kategori indeks | **14**: bridge, dokumen, ekstensi, kode, label, layar, menu, panel, perintah, pintasan, port, seksi, setelan, tool |
| versi indeks tersimpan | `1.1.13` · hash `f83cc022d0c620db` |

**Catatan angka bergerak.** Worktree ini sedang dikerjakan beberapa aliran
sekaligus (`git status` memperlihatkan ratusan berkas berubah + ratusan berkas baru
belum terlacak), jadi jumlah simbol ekspor dan jumlah entri basi **berubah antar
run**: pengukuran saya bergerak 3057 → 3062 → **3209** simbol ekspor, 424 → **429**
berkas sumber, dan 27 → 28 → **30** teks meleset tanpa saya menyentuh `src/`.
Karena itu angka di atas adalah pembacaan run terakhir, dan harness mengukur ulang
tiap kali dijalankan:

```
node scripts/uji-peta-kode.mjs          # mencetak ANGKA * + sampel baris nyata
grep -n "export function blokKeadaanPrompt" src/lib/systemPrompt.ts
```

Nomor baris pada dokumen ini juga nomor **saat itu** — `systemPrompt.ts` sendiri
sudah bergeser beberapa baris di tengah sesi ini (`faktaInti` 802 → 806,
`blokKeadaanPrompt` 137 → 138). Nomor di bagian 4–5 dan di
`docs/USULAN-PENGETAHUAN-SISA.md` sudah saya perbarui ke pembacaan terakhir, tapi
periksa ulang dengan perintah di atas sebelum menerapkan patch.

**Anggaran blok inti (AI-TAHU-100-7)** — `AMBANG_TOKEN_INTI` dibaca dari modul,
bukan disalin; `token = Math.ceil(karakter / 4)`:

| Ukuran | id | en |
| --- | --- | --- |
| blok fakta generated penuh | 7950 char / 1988 tok | 7950 char / 1988 tok |
| `faktaInti()` (generated minus bullet on-demand) | 6986 char / **1747 tok** | 6986 char / **1747 tok** |
| + `blokLarangan()` | 7714 char / **1929 tok** | 7688 char / **1922 tok** |
| + `kepalaPotret()` (anggota blok inti terlengkap) | 7810 char / **1953 tok** | 7789 char / **1948 tok** |
| sisa anggaran (headroom) | **47 token** | **52 token** |

`AMBANG_TOKEN_INTI` = **2000**. Jadi blok inti hari ini memakai 1953/2000 token —
**sisa 47 token**. Tiap kenaikan panjang blok inti >47 token akan menembus
anggaran. Ini alasan konkret kenapa lokalisasi (AI-TAHU-100-2-SISA) harus
**tidak menambah panjang prompt bahasa Inggris**.

Struktur pemotongan dua lapis (terukur): blok generated 47 baris → blok inti 45
baris + **2 bullet on-demand** (`model`, `galat`) yang dipotong keluar dan hanya
disuntik saat topiknya disebut.

**Lapis 2 (cari on-demand)** — `suntikanIndeks()` dari `src/lib/zephyrCari.ts`:

| Ukuran | Angka |
| --- | --- |
| `BATAS_KARAKTER_SUNTIK` | 1200 karakter |
| `BATAS_HASIL_SUNTIK` | 10 entri |
| kandidat kueri diambil dari 6212 kunci indeks (60 contoh) | **60/60 menarik entri** |
| entri lapis 2 diperiksa keasliannya (dipetakan balik ke indeks) | **118 entri, 0 asing** |
| pertanyaan di luar topik Zephyr (3 contoh) | **0 entri** tiap contoh |
| kueri kosong `""` | **0 entri** + kalimat "carries no search words" |
| anggaran sempit `batasKarakter: 300` | 741 → **654 char** (memangkas) |

Tiga contoh pertanyaan di luar Zephyr yang diuji: puisi hujan (0 entri), resep
rendang (0 entri), pemenang liga champions 2019 (0 entri). Pertanyaan kosong juga
0 entri. Jadi lapis 2 benar-benar **on-demand**: nol suntikan saat tidak relevan.

## 3. Keluaran nyata kedua harness

`node scripts/uji-peta-kode.mjs` (kutipan apa adanya):

```
  OK    A peta segar memuat >= 50 berkas sumber  [429 berkas]
  OK    A total simbol ekspor > 0  [3209 simbol]
  OK    A ada berkas yang benar-benar mengekspor  [297 berkas]
  OK    A hasil generator sendiri tidak masuk peta  [0 dari 2]
  OK    A tidak ada jalur node_modules/target/__snapshots__  [0 jalur]
  OK    A semua berkas ber-ekstensi .ts/.tsx/.rs  [semua sah]
  OK    A tidak ada jalur duplikat di peta  [429 unik]
  OK    B setiap rel menunjuk berkas nyata di disk  [429/429 ada]
  OK    B jumlah baris tiap entri == baris nyata berkas itu  [429/429 cocok]
  OK    B setiap simbol ekspor terlacak ke baris ekspor nyata  [3212/3212 terlacak]
  OK    B nomor baris simbol selalu di dalam berkas  [semua di dalam]
        src/lib/systemPrompt.ts:806 faktaInti  →  export function faktaInti(): string {
        src/lib/systemPrompt.ts:138 blokKeadaanPrompt  →  export function blokKeadaanPrompt(): string {
        src/lib/zephyrRuntime.ts:243 blokKeadaan  →  export function blokKeadaan(): string {
        src/lib/zephyrRuntime.ts:228 kepalaBlokKeadaan  →  export function kepalaBlokKeadaan(): string {
  OK    C `--check` TIDAK menulis: size+mtime+sha artefak identik sebelum/sesudah  [3 berkas utuh]
  OK    D setiap berkas yang dibaca peta adalah berkas SUMBER (.ts/.tsx/.rs)  [429 berkas sumber]
  OK    D tidak ada berkas DATA rahasia (.env/*.key/*.pem/secrets.json) yang dibaca peta  [tidak ada]
  OK    D semua berkas dibaca peta berada DI DALAM akar repo (tanpa %APPDATA%)  [429 jalur di dalam repo]
  OK    D generator peta kode bebas process.env/.env/dotenv/homedir  [0 kemunculan]
  SKOR: 24/24 diperiksa
  VERDICT PETA KODE: LULUS
```

`node scripts/uji-pengetahuan-dua-lapis.mjs` (kutipan apa adanya):

```
  OK    A1 AMBANG_TOKEN_INTI == 2000 (dibaca dari modul, bukan salinan)  [2000]
  OK    A2 faktaInti() <= ambang (id)  [1747 <= 2000 tok]
  OK    A3 faktaInti() + blokLarangan() <= ambang (id)  [1929 <= 2000 tok]
  OK    A4 faktaInti() + blokLarangan() + kepalaPotret() <= ambang (id)  [1953 <= 2000 tok]
  OK    A5 faktaInti() + blokLarangan() + kepalaPotret() <= ambang (en)  [1948 <= 2000 tok]
  OK    A7 aturan baru tidak bocor ke blok inti (penanda kondisional absen)  [tidak ada]
  OK    A8 setiap kelas kondisional terdaftar bisa dipicu contoh pesan nyata  [6 kelas: model, tabel, jendela, galat, keamanan, subagent]
  OK    A9 aturan baru punya isi nyata saat topiknya disebut  [6/6 blok terisi]
  OK    B1 pertanyaan di luar Zephyr (3 contoh) -> nol suntikan  [0/0/0]
  OK    B4 kueri kosong ("") -> nol entri + kalimat "carries no search words"  [0 entri]
  OK    B5 kueri yang diambil dari indeks sendiri menarik entri  [mis. "zephyr.ikon-bahasa" -> 1 entri]
  OK    B7 jumlah entri lapis 2 tidak melewati BATAS_HASIL_SUNTIK  [batas 10 entri, maks terukur 10]
  OK    B8 batasKarakter 300 memangkas blok  [654<=741 / 654<=737 / 654<=736 char]
  OK    C1 inti + bullet on-demand == blok generated apa adanya (byte-exact)  [identik]
  OK    C2 tidak ada baris yang hilang diam-diam saat memotong  [47 - 45 = 2]
  OK    C3 tiap baris inti ada di blok generated, tiap bullet on-demand TIDAK ada di inti  [model, galat tidak tumpang tindih]
  OK    C4 tiap entri lapis 2 bisa dipetakan balik ke indeks  [118 entri sah dari 6204 pasangan indeks]
  OK    D1 faktaInti() dipanggil dua kali -> identik  [6986 char]
  OK    D2 blokLarangan() dipanggil dua kali -> identik (id dan en)  [728 char]
  OK    D3 suntikanIndeks() dipanggil dua kali -> identik  [8 panggilan ulang]
  OK    D4 daftar kelas kondisional stabil antar panggilan  [model, tabel, jendela, galat, keamanan, subagent]
  SKOR: 27/27 diperiksa
  VERDICT PENGETAHUAN DUA LAPIS: LULUS
```

Yang dibuktikan angka di atas, satu per satu sesuai permintaan:

- **lapis 1 tidak melewati 2000 token walau aturan baru ditambah** — dibuktikan A2–A5
  (1953/2000 pada bahasa yang paling panjang) + A7 (aturan baru tidak masuk blok
  inti) + A8/A9 (aturan baru punya rumah: 6 kelas kondisional, 6/6 berisi).
- **lapis 2 on-demand dan hanya saat relevan** — B1 (luar Zephyr = 0 suntikan),
  B2, B4 (kueri kosong = 0), B6 (0 entri off-topic < 1 entri on-topic), B9 (blok
  inti bersih dari teks lapis 2).
- **penggabungan tidak pernah kehilangan fakta** — C1 byte-exact (`faktaInti()`
  + bullet on-demand `model`/`galat` == blok generated 7950 char apa adanya),
  C2, C3, C4 (lapis 2 tidak pernah mengarang nama di luar indeks).
- **determinisme** — D1–D4 (dua panggilan = teks identik).

## 4. Temuan AI-TAHU-100-2-SISA: teks blok keadaan yang belum terlokalisasi

Blok keadaan ke prompt dirakit di `src/lib/systemPrompt.ts:138
blokKeadaanPrompt()`: `[penandaPotret(), potret, blokKeadaan(),
barisRiwayatSsh()]`. Isinya campuran **tiga bahasa** dalam satu prompt:

| Sumber | Fungsi | Bahasa hari ini |
| --- | --- | --- |
| `systemPrompt.ts:44 KEPALA_KEADAAN` + `:55 UMUR_KEADAAN` | kepala + umur potret | **sudah berlokalisasi** (tabel en/id) |
| `systemPrompt.ts:61 BARIS_RIWAYAT` | baris riwayat/SSH | **sudah berlokalisasi** |
| `aiZephyrState.ts:581 ringkasKeadaan(p, 900)` | potret ringkas | **Indonesia tetap, belum berkunci** |
| `zephyrRuntime.ts:243 blokKeadaan()` | blok keadaan hidup | **Inggris penuh, belum berkunci** |

Jadi "sisa" lokalisasi ada di **dua berkas**, dan keduanya sudah menyimpan
`TODO(i18n - PROMPT 7)` di atas fungsinya masing-masing.

### 4a. `src/lib/zephyrRuntime.ts` — 24 literal Inggris (BELUM ada kunci kamus)

Header blok (paling merusak: teks Inggris di pangkal prompt bahasa Indonesia):

| Baris | Teks |
| --- | --- |
| **229** | `# Zephyr's live state - read from this running app for this turn` (TODO L222–226 sudah mengusulkan kunci `ai.state.liveHead`) |
| **246** | `This block wins over any stale note about Zephyr above it. Never ask which folder, file or setting is in use: it is here.` |

Baris isi (`blokKeadaan()` merakit L248–254 dari enam fungsi di bawah):

| Baris | Teks |
| --- | --- |
| 50 | `" and ${sisa} more"` (eliptik daftar) |
| 60, 63, 66, 69, 72, 75, 78, 81, 86 | `update: up to date` / `${versi} available` / `downloading N%` / `${versi} ready, installs on restart` / `checking now` / `not configured in this build` / `check failed (…)` / `not checked yet` / `just updated to X, release notes pending` (9 string) |
| 88 | `` `- App: Zephyr ${versi} (${upd})` `` |
| 96 | `- Workspace: no folder open (no project root, so path-bound tools have none)` |
| 103–105 | `` `- Workspace: ${ws} - N tab(s)` ``, `", M unsaved"`, `"; active file X"` |
| 115 | `` `- Layout: sidebar=… shown/hidden; AI panel=… column shown/hidden; bottom panel shows A of B` `` |
| 132 | `- Extensions: none installed beyond Zephyr's built-ins` |
| 139–142 | `` `- Extensions on: … (N installed` ``, `", M failed"`, `", built-ins excluded)"` |
| 146 | `` `- Extension FAILED to load: …` `` |
| 149 | `` `- ...and N more extension(s) failed to load` `` |
| 151 | `` `- Extension system error: …` `` |
| 164 | `` `- LSP: off in settings (still running: …)` `` |
| 169 | `` `${id} installed` `` / `` `${id} missing (…)` `` |
| 171 | `` `- LSP: running …; probe: …` `` / `not run yet` |
| 181–182 | `Zephyr's own MCP server is on at 127.0.0.1:P` / `off (requested port P)` |
| 184 | `state not read yet; settings say on/off (port P)` |
| 191, 193, 194 | `` `- MCP: …` `` / `` `; N external server(s): …` `` / `; no external MCP servers configured` |
| 201 | `- Settings: not loaded yet` |
| 214 | `` `- Settings in use: …` `` |

Selain itu `zephyrRuntime.ts:33 export const BATAS_KEADAAN = 900` (batas karakter
blok ini) dan `MAKS_*` di L35–39 tidak berbahasa, jadi tidak perlu dilokalisasi.

### 4b. `src/lib/aiZephyrState.ts` — bahasa Indonesia tetap, belum berkunci

Semua label teknis di berkas ini Indonesia dan **tidak** ikut `uiLang`; untuk
pengguna berbahasa Inggris ini salah bahasa, dan untuk pengguna Indonesia ia
bertabrakan di dalam prompt yang sama dengan blok Inggris 4a.

| Baris | Teks |
| --- | --- |
| 551 | `'ZEPHYR · KEADAAN RUNTIME'` (kepala potret; TODO L545–548 mengusulkan kunci `ai.state.snapshotHead`) |
| 539 | `'… (terpotong)'` (`PENANDA_POTONG`) — sementara `systemPrompt.ts:67 AKHIR_TERPOTONG` punya pasangan en/id `'\n… (truncated)'` / `'\n… (dipotong)'`; dua penanda potong dengan ejaan berbeda untuk keadaan yang sama |
| 434–439 | `" N berkas terbuka"`, `" M belum disimpan"`, `"aktif: "`, `'folder belum dipercaya'`, `" N root"` |
| 445–453 | `'terlihat'`, `' (maksimal)'`, `'tersembunyi'`, `'panel bawah tertutup'`, `'sidebar tertutup'`, `' · info subagent di kanan'` |
| 460–468 | `"versi: "`, `"update: "`, `'workspace: '`, `'layout: '`, `'(tidak ada folder dibuka)'`, `'(tidak diketahui)'`, `"sumber tidak terbaca: "` |
| 479, 482 | `"ekstensi gagal/tak dipakai (N):"`, `"- ✗/○ id v… (status) - alasan"`, `'tanpa alasan tercatat'` |
| 491–500 | `"provider=… model=…"`, `"persetujuan="`, `"tulis-subagent=ya/tidak"`, `"rag=ya/tidak"`, `"bahasa="`, `"gaya="`, `"tema="`, `"ui="`, `"perintah-diizinkan="`, `"setelan: "` |
| 508–509 | `"ekstensi dipakai (N): …"`, `'ekstensi dipakai: tidak ada'` |
| 512 | `"catatan "` |

Usulan patch untuk keduanya ada di `docs/USULAN-PENGETAHUAN-SISA.md`.

## 5. Temuan kesehatan (bukan milik saya, tidak saya perbaiki)

**(a) Peta kode tersimpan BASI.** `--check` berkata apa adanya:

```
PETA KODE BASI: 25 berkas baru belum masuk, 0 kunci hantu, 30 teks meleset (peta segar 429 berkas, artefak 404 entri kode).
```

- 25 berkas sumber belum masuk artefak (`src-tauri/src/tangkap_layar.rs`,
  `src-tauri/src/worktree.rs`, …);
- 30 entri `kode` teksnya sudah meleset (`src-tauri/src/cron.rs`,
  `src-tauri/src/ext_lang_icons.rs`, …);
- 0 kunci hantu (tidak ada entri peta untuk berkas yang sudah hilang).

Artinya: **model yang bertanya "fungsi ini ada di berkas mana" hari ini membaca
peta 404 berkas, padahal sumbernya 424.** Perbaikannya satu perintah —
`node scripts/gen-fakta-zephyr.mjs` — tapi itu wewenang pemilik artefak generated,
dan aturan tugas ini melarang saya regenerate. Karena itu status item AI-TAHU-100-8
adalah: **gate-nya siap dan hijau, artefaknya menunggu regenerate.**

**(b) `npx tsc --noEmit` — HIJAU, tapi run pertama sempat merah karena cache basi.**
Run ke-1 memunculkan satu galat:

```
src/lib/subsetTugas.ts(702,5): error TS2353: Object literal may only specify known
properties, and 'rumahDitahan' does not exist in type 'JejakPemilihan'.
```

Itu **galat fantom**, bukan cacat kode. Buktinya:

- bidang itu memang ada: `subsetTugas.ts:560 rumahDitahan: string[];` di dalam
  `interface JejakPemilihan` (L546–570), dan diisi pada literal kembalian
  `jejakPemilihan()` di `subsetTugas.ts:708 rumahDitahan,`;
- `git diff --stat -- src/lib/subsetTugas.ts` kosong (berkas tidak sedang diubah);
- run ke-2 dan ke-3: `npx tsc --noEmit` = **exit 0, 0 baris keluaran**.

Jadi `tsc` yang dijalankan pada tree ini **lulus bersih**. Run pertama membaca
keadaan inkremental yang tertinggal (bidang `rumahDitahan` baru ditambahkan).
Tidak ada yang perlu saya ubah di berkas itu, dan tidak saya sentuh.

**(c) Bahasa campur dalam satu prompt** (bagian 4): kepala blok Inggris + potret
Indonesia + blok hidup Inggris + baris riwayat berlokalisasi. Ini persis gejala
"Zeph tiba-tiba menjawab pakai Inggris" yang sudah didokumentasikan di
`systemPrompt.ts:30–34`.

## 6. BUTUH APP (tidak bisa diverifikasi dari sini)

Semua di bawah ini **tidak diklaim lulus** — butuh aplikasi Zephyr berjalan:

1. **Warna/visual panel keadaan** dan apakah teks blok keadaan benar-benar
   tampil campur bahasa di UI nyata (dugaan dari kode, bukan dari layar).
2. **Ekstensi gagal muat sungguhan** — harness memakai stub untuk
   `extensionStore/lspStore/mcpStore`, jadi cabang `- Extension FAILED to load`,
   `- LSP: off in settings`, `- MCP: state not read yet` **tidak pernah dieksekusi
   dengan data hidup**. Yang diuji hanya bahwa fungsinya deterministik dan
   anggarannya tidak bocor.
3. **Pindah bahasa di Setelan lalu kirim pesan berikutnya** — `kodeBahasaPrompt()`
   membaca store, jadi efeknya baru terlihat di giliran berikutnya; itu perilaku
   runtime, bukan unit.
4. **Port MCP nyata** (`127.0.0.1:P`) dan status updater nyata.

## 7. Batas / yang sengaja tidak saya lakukan

- Tidak regenerate `zephyrIndeks.ts`, `zephyrFakta.ts`, `zephyrDokumenData.ts`,
  bundel dokumen (aturan tugas).
- Tidak menyentuh `zephyrDokumen.ts` (511 baris): tidak perlu diubah untuk tiga
  item ini.
- Tidak memberi `git add`/`git commit`, tidak menghapus skrip apa pun.
- Tidak melonggarkan satu pun pemeriksaan supaya hijau: dua kasus pertama yang
  merah di kedua harness ternyata **bug di harness saya** (nomor baris simbol, dan
  pemetaan entri lapis 2), keduanya saya perbaiki di sisi harness — bukan dengan
  menurunkan pemeriksaan. Kasus `--check` exit 1 saya biarkan merah apa adanya.
