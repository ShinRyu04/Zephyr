# Rancangan — Analisis Gambar & "Munculin UI"

Status: **rancangan + bukti**. Kode produk **tidak diubah**. Berkas baru:
`docs/RANCANGAN-ANALIS-GAMBAR-DAN-UI.md`, `scripts/uji-analis-gambar-rencana.mjs`,
`scripts/uji-munculin-ui-rencana.mjs`. Semua titik sambung di bawah sudah dicek
ke barisnya (berkas + nomor baris), bukan tebakan.

Dua item:

- **ZEPH-ANALIS-GAMBAR** — Zeph menerima gambar yang user lampirkan, lalu
  menganalisisnya (teks/OCR, isi, letak elemen).
- **ZEPH-MUNCULIN-UI** — Zeph **memunculkan sesuatu** di dalam Zephyr (membuka
  panel / bagian Settings / mengatur pane), persis seperti aksi "Setujui" yang
  membuka panel.

---

## Bagian A — ZEPH-ANALIS-GAMBAR

### A.1 Jalur gambar: dari percakapan ke otak

Gambar masuk sebagai **data URL** (`data:<mime>;base64,<payload>`), diperiksa,
disimpan di draft, ikut field `images`, lalu dipecah Rust `split_data_url`
menjadi content-part per provider.

| Tahap | Berkas : baris | Fungsi / bukti |
|---|---|---|
| Pintasan tempel (paste) | `src/components/ai/AiPanel.tsx:641` → `:646` | `clipboardReadImage()` → `addDraftImage(url)` |
| Tempel via REQUEST gadget | `src/components/ai/AiPanel.tsx:1990, :1997-1999` | jalur tempel kedua (paste event) |
| Pemilih berkas / drag-drop | `src/components/ai/AiPanel.tsx:2133` (`accept="image/*"`), `:2147` | `r.onload = () => addDraftImage(String(r.result))` |
| Baca papan klip | `src/lib/clipboard.ts:29` `clipboardReadImage()` | `:37` skala `width > 1600 ? 1600/width : 1` |
| **Penyimpanan lampiran (fungsi nyata)** | `src/lib/aiStore.ts:3583` `addDraftImage(dataUrl)` | cek jumlah (11→tolak) & byte (3.500.000) |
| State draft | `src/lib/aiStore.ts:3171` `draftImages: []` (tipe `:2645`) | satu-satunya daftar gambar pesan |
| Hapus / bersihkan | `src/lib/aiStore.ts:3605` `removeDraftImage`, `:3607` `clearDraftImages` | — |
| Batas keras | `src/lib/aiStore.ts:250` `MAX_IMAGES = 10`, `:252` `IMAGE_MAX_BYTES = 3_500_000` | dicek di `addDraftImage` |
| **Pintu murni yang memeriksa** | `src/lib/analisGambar.ts` (murni, 0 impor) | lihat A.2 |
| Transport | `src-tauri/src/adapters/mod.rs:10` `split_data_url` | `ChatMsg.images: String[]` → part per provider |

Modul `src/lib/analisGambar.ts` adalah satu pintu yang memeriksa bentuk gambar
sebelum disimpan:

| Berkas : baris | Ekspor | Guna |
|---|---|---|
| `analisGambar.ts:104` | `MIME_DIIZINKAN` | allow-list format |
| `analisGambar.ts:121` | `ANALIS_MAKS_BYTE = 3_500_000` | langit-langit byte = `aiStore.IMAGE_MAX_BYTES` |
| `analisGambar.ts:124` | `ANALIS_MAKS_GAMBAR = 10` | langit-langit jumlah = `aiStore.MAX_IMAGES` |
| `analisGambar.ts:127` | `ANALIS_SISI_MAKS = 1600` | sisi terpanjang sesudah perkecil |
| `analisGambar.ts:138,:139` | `KUALITAS_TANGGA`, `SKALA_TANGGA` | tangga perkecil |
| `analisGambar.ts:434` | `siapkanGambar(k, opsi?)` | pintu diperiksa (bentuk + byte) |
| `analisGambar.ts:450,:455,:469` | `gambarDariTempel/Berkas/Lampiran` | tiga jalur masuk |
| `analisGambar.ts:477` | `periksaJumlah(daftar, maks=10)` | tolak gambar ke-11 |
| `analisGambar.ts:516` | `rencanaPerkecil(masukan)` | **murni**: byte/mime/dimensi → `{aksi,langkah,skalaAwal}` |
| `analisGambar.ts:546` | `perkecilGambar(g, ubah, opsi?)` | jalankan tangga lewat adapter |
| `analisGambar.ts:697` | `adapterKanvas()` | satu-satunya bagian butuh DOM (=BUTUH APP) |
| `analisGambar.ts:616,:625,:636` | `ringkasGambar`, `barisLog`, `sensorBase64` | **log aman**: tanpa payload |
| `analisGambar.ts:663,:670,:675,:680` | `kontenOpenAI`, `blokAnthropic`, `partGemini`, `daftarDataUrl` | bentuk kirim ke provider |

### A.2 Batas ukuran / piksel (angka nyata)

- **Per gambar:** `3.500.000` byte terdekode (`image/png`, `jpeg`, `webp`,
  `gif`). Sama dengan `aiStore.IMAGE_MAX_BYTES` (`aiStore.ts:252`). Dua
  langit-langit berbeda = gambar lolos panel lalu dibuang store, jadi sengaja
  satu angka.
- **Per pesan:** `10` gambar (`aiStore.MAX_IMAGES`, `aiStore.ts:250`).
- **Piksel:** sisi terpanjang diturunkan ke `1600` px (`ANALIS_SISI_MAKS`),
  target yang sama dengan `clipboard.ts:37`. Tangga 4 langkah tidak pernah
  **membesarkan** (`skalaAwal = min(1, 1600/terpanjang)`; langkah = `skalaAwal ×
  [1,1,0.6,0.35]`, dijepit ≥ 0.05).
- **GIF besar tidak bisa diperkecil** (re-encode merusak animasi) → langsung
  `tolak`; gambar lain → `kecilkan`.

### A.3 Format yang didukung

Allow-list **tertutup**: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
`.jpg/.jpeg` dinormalkan ke `image/jpeg`; `.svg` / `.bmp` / `.tiff` sengaja
**tidak** dipetakan (ditolak dengan pesan sendiri). Yang penting: mime yang
**dideklarasikan** harus **cocok dengan byte**-nya — `.png` yang isinya teks
ditolak `mime_tidak_cocok`, bukan dikirim sebagai gambar kosong.

### A.4 Apa arti "analisis" dan di mana batasnya (jujur)

Yang ada di repo adalah **jalur gambar**, bukan mesin OCR lokal. "Membaca
gambar" di Zephyr berarti: gambar diperiksa + dikirim sebagai content-part
gambar ke provider multimodal (`kontenOpenAI`/`blokAnthropic`/`partGemini`),
lalu **model** yang menghasilkan teks (OCR / deskripsi) dan menyebut letak
elemen. Tidak ada langkah OCR/koordinat di sisi klien.

Konsekuensi yang harus ditulis apa adanya:

- **OCR/deskripsi/koordinat = keluaran model**, bukan modul repo. Harness ini
  membuktikan *masuknya* gambar benar, bukan mutu teks yang dihasilkan model.
- **BUTUH APP** untuk membuktikan gambar benar-benar terlihat model: perlu
  Zephyr hidup + provider multimodal aktif + jendela. Yang bisa dibuktikan
  node-only adalah pipeline bentuk/ukuran/batas (dilakukan di harness).

### A.5 Keluaran analisis: jalur luar repo & payload

Dua aturan pada tiap jejak/keluaran analisis (log, toast, laporan bug, jawaban
yang mengutip teks-OCR):

1. **Payload base64 tidak pernah lolos.** `ringkasGambar` (`:616`) secara
   bangun tidak punya field base64; `barisLog` (`:625`) hanya mime+ukuran+`nama`;
   `sensorBase64` (`:636`) menyapu tiap rentetan base64 32+ → `<gambar-disenyapkan>`.
2. **Rancangan (belum ada di produk): jalur absolut di luar repo WAJIB
   berpenanda.** Jalur di dalam repo ditulis ulang jadi relatif; yang di luar
   diganti `<jalur-luar-repo>`. Petunjuk nyata yang dipakai rancangan ini:
   `normJalur` (`src/lib/alurVerifikasi.ts:145`). **Kenapa tidak sekadar
   `normJalur`:** fungsi itu mencari *potongan* direktori repo di mana saja
   (`DIR_REPO`, `alurVerifikasi.ts:135`), jadi jalur luar repo yang kebetulan
   memuat `docs/` (mis. `C:\Users\Zyrex\docs\catatan.md`) **salah** diklaim
   repo-relatif → `docs/catatan.md`. Penanda karena itu **berjangkar ke akar
   repo**, bukan cocok-potongan. Perilaku `normJalur` yang salah-klasifikasi ini
   dipakukan sebagai kasus uji (G12) supaya tak diam-diam diandalkan.

Titik sambung untuk penanda ini (USULAN, tidak diubah): keluaran analisis
melewati `barisLog`/`sensorBase64` sebelum ditampilkan; penanda jalur dipasang
di jalur yang sama (`analisGambar.ts` seksi "log safety", `:611`).

### A.6 Usulan patch (hanya bila disetujui)

Tidak ada patch wajib: seluruh jalur masuk/batas/format **sudah** benar dan
teruji. Satu usulan opsional, **tanpa diberlakukan di sini**:

- **Berkas:** `src/lib/analisGambar.ts`, seksi "log safety" (`:611‑638`).
  **Usul:** tambah `sensorJalurLuar(teks, akarRepo?)` yang memakai `normJalur`
  + pemeriksaan awalan akar repo, lalu panggil dari `barisLog`. **Alasan:**
  menutup jalur luar-repo pada jejak analisis. **Bukti kebutuhan:** kasus G12.

---

## Bagian B — ZEPH-MUNCULIN-UI

### B.1 Aksi yang boleh dipanggil model (himpunan TERTUTUP)

Permukaan "munculin UI" = **3 peta nyata** dari `src/lib/zephyrTools/kendaliJendela.ts`.
Model memanggilnya lewat tool yang **sudah ada**: `mcp__zephyr__run_command`
(param `panel` / `settings`, `mcp.ts:148`) dan `mcp__zephyr__pane`
(`mcp.ts:575`).

**Panel (6)** — `KONTROL_PANEL` (`kendaliJendela.ts:58`), nilai = id perintah nyata:

| id panel | perintah (ada di `commandRegistry.ts`) |
|---|---|
| `problems` | `problemsPanel.focus` |
| `output` | `outputPanel.focus` |
| `debug` | `debugConsolePanel.focus` |
| `terminal` | `terminalPanel.focus` |
| `ports` | `portsPanel.focus` |
| `subagents` | `subagentsPanel.focus` |

Diverifikasi: id/`command` sama persis dengan `PANEL_TABS` (`panelStore.ts:16`)
dan union `PanelTabId` (`panelStore.ts:6`).

**Bagian Settings (20)** — `KONTROL_SETELAN` (`kendaliJendela.ts:80`). Nilainya
`'store'` (`PEMBUKA_STORE`, `:78`) atau id perintah nyata. Yang punya pintasan
resmi: `general→view.settings`, `theme→settings.theme`,
`shortcuts→shortcut.list`, `extensions→settings.extensions`. Sisanya (16):
`editor, agents, rules, subagent, permissions, lsp, scm, mcp, tests, devenv,
devupdate, security, accessibility, ssh, memori, about` → dibuka langsung
(`setActivity`+`setSettingsOpen`+`setSection`). Union cocok persis dengan
`SectionId` (`settingsStore.ts:6`).

**Aksi pane (11)** — `AKSI_PANE` (`kendaliJendela.ts:261`): `open, close,
rotate, split, grid, group, consolidate, tab, nextTab, prevTab, focus`. Sama
persis dengan enum di tool `pane` (`mcp.ts:575+`). Dua aksi punya argumen wajib:
`tab` butuh `target`, `focus` butuh `leafId`.

**Total yang dipaparkan: 6 + 20 + 11 = 37** token, semua berasal dari sumber ini.

### B.2 Kenapa HANYA itu

1. **Tiap aksi punya pemetaan nyata.** Panel → id perintah yang benar-benar ada
   di `commandRegistry.ts`; setelan → perintah nyata atau store; pane → cabang
   nyata di `aksiPane` (`kendaliJendela.ts:299`). Tidak ada nama yang "ada di
   peta tapi tidak bisa diklik" (diverifikasi U5/U6/U14/U15).
2. **Himpunan tertutup, bukan jalur bebas.** `bukaPanel` (`:173`) menolak nama
   tak dikenal **beserta daftar** yang benar; `bukaSetelan` (`:219`) idem.
   `aksiPane` menolak aksi tak dikenal & aksi tanpa argumen wajib. Model tidak
   bisa menyelundupkan perintah lewat param ini.
3. **Selalu melaporkan keadaan nyata.** Ketiganya memanggil `ringkasJendela()`
   (`:124`) sesudah aksi — jawaban berisi panel/tab/setelan yang **benar-benar**
   aktif, jadi tidak ada "aku sudah membuka X" palsu.
4. **Satu tool, bukan tool baru.** `panel`/`settings` menumpang `run_command`
   yang sudah dipakai (`mcp.ts:148`, komentar di `:175‑184`): yang berubah bagi
   model hanya nilai parameter, tak ada nama tool tambahan yang harus ditemukan.

### B.3 Yang SENGAJA TIDAK dipaparkan (dan di mana ia benar-benar ada)

Permukaan "munculin UI" **bukan** permukaan eksekusi. Tiga kemampuan berbahaya
ada di tool **terpisah** dan **tidak** termasuk daftar 37 token di atas:

| Kemampuan | Tool nyata (tempat lain) | Perilaku |
|---|---|---|
| Terminal bebas (jalankan perintah) | `mcp__zephyr__sh` (`mcp.ts:447`) | menjalankan shell — **di luar** permukaan UI |
| Hapus berkas | `delete_file` (`src/lib/zephyrTools/builtins.ts:898`) | menghapus berkas — **di luar** |
| Buka web / pratinjau | `browser_open` (`src/lib/zephyrTools/web.ts:376`; `catalog.ts:222`), `open_preview` (`builtins.ts:2065`) | aksi browser — **di luar** |

Harness memeriksa tiap token agar tidak sama dengan nama/alat berbahaya mana pun
dan tidak berbentuk perintah (tanpa `/ \ spasi ; & | $ ` < >`).

**Nuansa yang ditulis apa adanya:** panel `terminal` & aksi pane `open`
(`kendaliJendela.ts:307` → `addPane('shell')`) **membuka** pane terminal, tetapi
**tidak** menerima perintah dari model lewat permukaan ini. Jadi "munculin UI"
memunculkan *jendelanya*, bukan *perintahnya*. `terminal` di sini bukan "terminal
bebas".

### B.4 Contoh alur "Setujui → panel terbuka"

1. User: "buka tab Problems setelah aku setujui." Model memanggil
   `mcp__zephyr__run_command` dengan `{ panel: "problems" }`.
2. `run_command` (`mcp.ts:185`) → `bukaPanel("problems")` (`:173`) → jalankan
   perintah `problemsPanel.focus` lewat registry (perintah nyata).
3. Jawaban = `ringkasJendela()` (`:124`): baris keadaan nyata ("panel aktif
   problems, ..."). Model membaca apa yang **benar-benar** terbuka.
4. Panel tak dikenal → ditolak dengan daftar (`ERROR: panel "x" tidak dikenal.
   Panel yang ada: problems, output, ...`) — bukan tebakan.

---

## Bagian C — Bukti (jalankan & hasil)

```
node scripts/uji-munculin-ui-rencana.mjs
node scripts/uji-analis-gambar-rencana.mjs
npx tsc --noEmit
```

`uji-munculin-ui-rencana.mjs` (15 pemeriksaan, analisis statis ke berkas
sumber): U1–U4 keutuhan himpunan (panel/setelan vs `PANEL_TABS`/`PanelTabId`/
`SectionId`); U5–U6 pemetaan ke `commandRegistry`; U7 `PEMBUKA_STORE`; U8
`AKSI_PANE` vs enum `pane`; U9–U12 aturan tolak (panel/setelan tak dikenal, aksi
pane tak dikenal, argumen wajib); U13 daftar bebas terminal-bebas/hapus/browser;
U14 himpunan tertutup 6+20+11; U15 pelaporan `ringkasJendela`.

`uji-analis-gambar-rencana.mjs` (12 pemeriksaan, mengimpor fungsi **nyata**
`analisGambar.ts` + `alurVerifikasi.ts`): G1–G3 format (allow-list, terima byte
nyata, tolak tak didukung/mime tak cocok); G4–G6 batas byte/jumlah/sisi vs
`aiStore` & `clipboard`; G7 garis batas; G8–G10 perkecil (raksasa, GIF tolak,
dimensi tak diketahui); G11–G12 keluaran (penanda jalur luar-repo, `sensorBase64`,
`normJalur` salah-klasifikasi).

Detail lengkap di komentar kepala tiap skrip. `scripts/uji-analis-gambar.mjs`
(lane lain) **tidak disentuh**.

## Bagian D — Sisa / utang apa adanya

- **BUTUH APP:** gambar benar-benar terlihat model (multimodal), mutu OCR/
  deskripsi/koordinat, dan `adapterKanvas()` (`analisGambar.ts:697`, butuh DOM)
  tidak bisa dibuktikan node-only. Yang dibuktikan di sini adalah
  bentuk/ukuran/batas/keamanan keluaran.
- **Penanda jalur luar-repo (A.5) masih RANCANGAN**, belum ada di produk;
  harness memaku perilaku spesifikasinya + blok bangun nyata (`normJalur`,
  `sensorBase64`). Gap diketahui: penanda hanya menangani jalur absolut bergaya
  drive `X:\`/`X:/` dan UNC, belum jalur MSYS `/d/...`.
- **`uji-munculin-ui-rencana.mjs`** membaca sumber (statis), bukan menjalankan
  store — perilaku klik nyata = BUTUH APP; yang dipaku adalah bentuk daftar,
  pemetaan ke perintah nyata, dan aturan tolak yang terverifikasi ada di sumber
  (nomor baris penjaga dicetak di keluaran).
- Belum menyentuh `cargo test --lib` untuk lane ini (tidak perlu; `tangkap_layar.rs`
  sudah lulus 504/0 dari lane lain).
