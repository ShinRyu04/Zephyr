# USULAN — JANGKAUAN TOOL: menyambungkan baca-kode ke jalur kirim

> **Hanya usulan.** Tidak ada berkas `src/**` atau `src-tauri/**` yang disentuh. Semua nomor baris &
> teks "lama" disalin dari cabang `feat/ai-panel-vscode-layout` di `D:\Zephyr` pada 2026-10-14 dan dicek ulang
> terhadap berkas saat itu. Bukti keadaan sekarang: `scripts/uji-jangkauan-tool.mjs` (63/63) +
> `docs/LAPORAN-JANGKAUAN-TOOL.md`.

## Kenapa dokumen ini ada (dan apa bedanya dengan yang sudah ada)

Sudah ada `docs/USULAN-BACA-KODE.md` (design modul + katalog) dan `docs/USULAN-FETCH-WEB.md` (ambil-web:
registrasi U1, `web_fetch` memakai `ambilWeb()` U2, gerbang host/UI U5–U6). Dokumen **ini** melengkapi bagian yang
tak ada di sana dan yang justru membuat tool benar-benar sampai ke model:

| Delta dokumen ini | Alasan belum ada di dokumen lain |
|---|---|
| **U-JT2** Registry eksekutor `AGENT_TOOLS` | `USULAN-BACA-KODE.md` berhenti di katalog; tanpa ini nama tak bisa di-resolve jadi spec |
| **U-JT3** Sambungan ke **subset kirim** (`subsetTugas.ts`) + analisis cap 20 | `USULAN-SUBSET-TUGAS.md` tak menyebut `zephyr_kode` sama sekali |
| **U-JT4** Call-site jembatan (`pasangJembatanBacaKode` **NOL pemanggil**) | modul tidak bisa jalan tanpa ini; `realpath` tanpa perintah Tauri |
| **U-JT6** Dampak regresi angka (67→68) di dokumen generator | agar tidak "memperbaiki" berkas generator (aturan: jangan sentuh) |

Skema argumen: **pakai ulang `SPEC_BACA_KODE` (`bacaKode.ts:679`, `name` di `:680`) — JANGAN bikin skema kedua.**
`zephyr_kode` nama tunggal (grep seluruh `src/**` di luar definisinya = 0), jadi tak ada tool kembar
(bandingkan `scripts/inventaris-tool.mjs` + `scripts/deteksi-duplikat-tool.mjs`; catatan kembar yang ADA di repo
adalah `fetch` vs `web_fetch`, bukan `zephyr_kode`).

---

## U-JT1 — Katalog: daftarkan `zephyr_kode`

**Berkas:** `src/lib/zephyrTools/catalog.ts` — sisipkan setelah baris **132** (`lsp_call_hierarchy`).
Grup `'Code intelligence'` sudah ada (dipakai 6 entri `lsp_*` di :127-132), jadi tak perlu grup baru.

teks lama:
```ts
  ['lsp_call_hierarchy', 'Code intelligence', 'read', false, 'Fungsi yang memanggil dan dipanggil oleh sebuah simbol, menurut language server'],
```

teks baru:
```ts
  ['lsp_call_hierarchy', 'Code intelligence', 'read', false, 'Fungsi yang memanggil dan dipanggil oleh sebuah simbol, menurut language server'],
  /* Baca ISI kode sendiri sebagai potongan baris bernomor (`bacaKode.ts`).
     `lsp_*` hanya MENUNJUK lokasi; entri ini yang mengirim isi nyatanya. Nama
     `zephyr_kode` unik (tak ada kembar), jadi tak melanggar aturan deteksi-duplikat. */
  ['zephyr_kode', 'Code intelligence', 'read', false, 'Baca ISI kode Zephyr sendiri sebagai potongan baris bernomor (rentang baris atau simbol); berkas rahasia dan jalur luar repo ditolak'],
```

Konsekuensi: `TOOL_CATALOG` 67 → **68**. `TOOL_COUNTS` (`catalog.ts:278`) **dihitung otomatis** — tidak perlu diedit.
`effect: 'read'` + `needsApproval: false` sejalan dengan gerbang baca-saja (mode baca tidak menyaring `read`).

> Alternatif lokasi: setelah `zephyr_self` (`catalog.ts:93`) seperti diusulkan `docs/USULAN-BACA-KODE.md` §1.
> Dua-duanya sah; grup `Code intelligence` dipilih agar `zephyr_kode` berdekatan dengan `lsp_*` yang menjawab
> pertanyaan sama ("soal kode").

## U-JT2 — Registry eksekutor: `AGENT_TOOLS`

**Berkas:** `src/lib/agentTools.ts`.

(a) tambah impor, sesudah baris **19**:
teks lama:
```ts
import { TOOL_WEB } from './zephyrTools/web';
```
teks baru:
```ts
import { TOOL_WEB } from './zephyrTools/web';
import { TOOL_BACA_KODE } from './bacaKode';
```

(b) tambah ke array, baris **56-71** (`AGENT_TOOLS`):
teks lama:
```ts
  TOOL_INGAT,
  ...TOOL_MCP,
  ...TOOL_WEB,
];
```
teks baru:
```ts
  TOOL_INGAT,
  ...TOOL_MCP,
  ...TOOL_WEB,
  TOOL_BACA_KODE,
];
```

Tanpa (b), nama `zephyr_kode` bisa ada di katalog & subset tetapi **tidak bisa di-resolve** ke spec/handler
(`agentTools.ts:167` `AGENT_TOOLS.find(...)`), sehingga `tool_call`/pengiriman gagal di titik eksekusi.

## U-JT3 — Subset: `subsetTugas.ts` (jalur kirim NYATA, cap ≤20)

Jalur kirim sesungguhnya = `pilihToolTugas` (`subsetTugas.ts:743`) → `jejakPemilihan` (`:586`).
Aturannya: tiap keluarga di `wajib` menyumbang **satu rumah** (`tersedia[0]`), sisanya jadi cadangan
(reachable lewat `tool_search`), dan jatah dijaga `BATAS_TOOL_TUGAS = 20` (`:61`, ditegakkan `:638/:668/:680`).

**U-JT3a — pemetaan keluarga (agar dilaporkan konsisten).** Setelah baris **145**:
teks lama:
```ts
  lsp_call_hierarchy: ['navigasi-kode'],
```
teks baru:
```ts
  lsp_call_hierarchy: ['navigasi-kode'],
  zephyr_kode: ['navigasi-kode'],
```

**U-JT3b — masuk daftar rumah `navigasi-kode` sebagai cadangan.** Baris **402**:
teks lama:
```ts
  'navigasi-kode': ['lsp_definition', 'lsp_symbols', 'lsp_references', 'lsp_diagnostics'],
```
teks baru:
```ts
  'navigasi-kode': ['lsp_definition', 'lsp_symbols', 'lsp_references', 'lsp_diagnostics', 'zephyr_kode'],
```
Efek: `zephyr_kode` menjadi **cadangan** keluarga `navigasi-kode` (bisa dipanggil lewat `tool_search`/`tool_call`),
tetapi belum otomatis dikirim — karena rumah terpilih tetap `lsp_definition`.

**U-JT3c — agar IKUT DIKIRIM untuk tugas membaca kode.** Di `tambahanKelas` (baris ~**474**):
teks lama:
```ts
  if (kelas.includes('baca')) {
    push('list_directory');
    push('bash_logs');
    push('lsp_diagnostics');
    push('calculator');
  }
```
teks baru:
```ts
  if (kelas.includes('baca')) {
    push('zephyr_kode');
    push('list_directory');
    push('bash_logs');
    push('lsp_diagnostics');
    push('calculator');
  }
```
`push` menaruh di depan → `zephyr_kode` diprioritaskan dalam jatah `tambahan`. Kelas `'baca'` adalah kelas
**default** (`deteksiKelasTugas`, `subsetTugas.ts:291-303`: teks kosong/ambigu → `'baca'`), jadi pertanyaan
"cara kerja X" benar-benar membawanya.

> **Analisis cap (penting):** `tambahan` dijaga jatah (`:666`), jadi menambah satu nama di sini **tidak** bisa
> menembus 20. Ini alasan memilih `tambahanKelas` ketimbang menaruh keluarga baru di `KELUARGA_DASAR`:
> `KELUARGA_DASAR` sudah 17 keluarga (`:331-353`) dan komentar di `:616-627` mencatat dasar+tulis+web sudah
> **21 tool** — satu harus mengalah. Menambah keluarga ke-18 membuatnya **22**, dua yang mengalah, berisiko
> menggeser permukaan web/panel pada tugas yang justru membutuhkannya. **Jangan** jadikan `zephyr_kode` keluarga
> wajib-dasar kecuali Anda siap menaikkan `BATAS_TOOL_TUGAS` (dan itu keputusan produk terpisah).

## U-JT4 — Jembatan: `pasangJembatanBacaKode` NOL pemanggil

`bacaKode.ts:713` mengekspor `pasangJembatanBacaKode`, tetapi grep `src/**` = **tidak ada pemanggil**. Selama itu,
`jalankanBacaKode` mengembalikan "belum tersambung" dan tool tetap tak berguna walau terdaftar.

**Usul** — pasang sekali saat workspace diketahui (mis. di `src/lib/aiStore.ts`, dekat jalur folder dibuka;
`cmd.fsRead`/`cmd.fsStat` sudah dipakai luas, contoh `aiStore.ts:1481`):
```ts
import { pasangJembatanBacaKode } from './bacaKode';
import { fsRead, fsStat } from './commands';

pasangJembatanBacaKode({
  akar: <akar repo/workspace>,
  cmd: {
    fsRead: async (p) => ({ content: (await fsRead(p, 'utf8')) ?? '' }),
    fsStat: async (p) => await fsStat(p),
    realpath: async (p) => p,   // LIHAT CATATAN di bawah
  },
});
```

> **CATATAN JUJUR — `realpath` belum ada.** Tidak ada perintah Tauri `fs_realpath` (`src-tauri/src/fs_utils.rs`
> hanya punya `fs_read/fs_write/fs_exists/fs_stat/fs_create_file/fs_create_dir/fs_delete/fs_rename`;
> `std::fs::canonicalize` hanya dipakai internal di `ext_pkg.rs`). Dua pilihan:
> - **(a) identitas** (`realpath: async (p) => p`) — cukup karena `bolehDibacaKode` sudah menolak `..`/absolut
>   secara leksikal dan `fs_read` backend sendiri berpasir ke workspace. **Kehilangan:** proteksi symlink.
> - **(b) tambah perintah Tauri `fs_realpath`** (`canonicalize` + hormati pagar "tak boleh folder user") lalu
>   pakai itu. **Butuh app hidup untuk menguji.** Rekomendasi: (a) sekarang, (b) menyusul.

## U-JT5 — Skema argumen: pakai ulang, jangan kembar

Sudah ada `SPEC_BACA_KODE` (`bacaKode.ts:679`; `name: 'zephyr_kode'` di `:680`;
props `berkas/dari/sampai/simbol`, `required: ['berkas']`; deskripsi menyebut angka batas
120 baris / 512 KiB / 1 berkas per panggilan / 12 per sesi). **Tidak perlu skema baru.** Import & pakai
`SPEC_BACA_KODE` (atau `TOOL_BACA_KODE` yang sudah memuatnya di `bacaKode.ts:740`).

## U-JT6 — Sisi ambil-web (cukup rujuk, jangan ulang)

`web_fetch` sudah **TERJANGKAU** (`catalog.ts:221` + `:620`), tetapi mengizinkan `http://` (tanpa lantai https).
Perbaikannya **sudah** diusulkan di `docs/USULAN-FETCH-WEB.md` (U2: `web_fetch` memakai `ambilWeb()`,
`ambilWeb.ts` https-only) dan `docs/USULAN-BROWSER-DAN-FETCH.md`. **Jangan** menambah gerbang ketiga —
jalankan §U0 dokumen itu lebih dulu.

---

## Dampak regresi & cara memverifikasi

1. **Angka hardcode di dokumen & keluaran generator** — `docs/plan-kerja.md` menyebut "66 tool" saat
   dokumen ini ditulis; **dokumen itu sudah dikoreksi** 2026-10-14 oleh item `angka-dokumen-tool-68`
   (68 tool / 26 dikirim; bukti di `docs/LAPORAN-ANGKA-DOKUMEN-TOOL.md`). Yang masih tertinggal adalah
   **keluaran generator**: `src/lib/zephyrDokumenData.ts` dan `src/lib/zephyrIndeks.ts` →
   **JANGAN sunting manual**; regenerasi lewat pipeline biasa. `TOOL_COUNTS` (`catalog.ts:278`) aman
   karena dihitung.
2. **`scripts/cek-kontrak-40.mjs:94`** meng-assert "43 tool inti AKTIF". Aman **selama** `zephyr_kode` **tidak**
   dimasukkan ke `TOOL_INTI` (`catalog.ts:581`-`) — usulan ini tidak melakukannya.
3. **`scripts/uji-jangkauan-tool.mjs` adalah uji regresi.** Sebelum patch ia meng-assert keadaan **sekarang**
   (4 kasus: "`zephyr_kode` TIDAK ADA di katalog", "…TIDAK PERNAH muncul di subset", "…TIDAK di AGENT_TOOLS",
   "…NOL importer"). Setelah patch diterapkan, keempat kasus itu **harus** di-balik menjadi asersi positif
   (atau ditambah flag `--harap-zephyr-kode`). Itu sengaja: harness mengunci keadaan, bukan menutupinya.
   Baris kepala `katalog: 67 tool` **sudah** berubah menjadi `katalog: 68 tool` (lihat
   `docs/LAPORAN-BACA-KODE-SAMBUNG.md:46` dan `:173`).
4. **`scripts/uji-kesiapan-tool.mjs` SALAH SASARAN** — ia mengukur `subsetAlat.alatUntukTugas`
   (`subsetAlat.ts:181-204`, jalur LAMA tanpa cap), bukan `pilihToolTugas` (`subsetTugas.ts:743`). Jangan
   jadikan ia gerbang untuk perubahan ini.
5. Verifikasi sesudah patch: `node scripts/uji-jangkauan-tool.mjs` (setelah asersi di-balik) **dan**
   `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` → 0 galat.
   Keduanya **tanpa app**. Uji eksekutor `web.ts` yang nyata tetap **butuh app hidup** (lapisan `import.meta.env`).

## Ringkas urutan patch

| # | Berkas | Baris | Sifat | Butuh app? |
|---|---|---|---|---|
| U-JT1 | `src/lib/zephyrTools/catalog.ts` | sisip setelah 132 | registrasi katalog | tidak |
| U-JT2 | `src/lib/agentTools.ts` | 19 + 70 | registry eksekutor | tidak |
| U-JT3a/b/c | `src/lib/subsetTugas.ts` | 145 / 402 / ~474 | subset kirim (cap ≤20) | tidak |
| U-JT4 | `src/lib/aiStore.ts` (+ opsi `src-tauri/src/fs_utils.rs`) | jalur buka folder | pasang jembatan | ya (uji) |
| U-JT5 | — | — | pakai ulang `SPEC_BACA_KODE` | tidak |
| U-JT6 | rujuk `docs/USULAN-FETCH-WEB.md` | — | https floor | ya (uji) |
