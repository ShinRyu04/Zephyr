# SPIKE 175 — Autocomplete inline (ghost text)

Status: **rancangan (read-only)**. Semua klaim hasil baca berkas nyata; nomor baris disebutkan.
Klarifikasi klaim lama: konteks menyebut "autocomplete inline **belum ada**". Setelah dibaca,
**mayoritas SUDAH ADA dan ter-wire** (widget ghost + keymap + debounce + setelan). Yang bolong adalah
**seam penyedia saran (provider)** dan **pemutusan listener saat fitur dimatikan** — persis dua hal
yang diminta di tugas ini.

---

## 1. Yang sudah ADA (bisa dipakai ulang)

Seluruh fitur inti tinggal di `src/lib/ghostText.ts` (409 baris):
- `setGhost` (20) — `StateEffect<string|null>` penyetel teks saran.
- `GhostWidget` (22) — widget dekorasi inline (`.cm-ghost`) + strip hint "Accept [Tab]" / "Accept Word [Ctrl→]".
- `ghostField` (104) — `StateField<DecorationSet>` yang **membersihkan saran saat dokumen berubah** (119-121).
- `pastikanListener` (135) — memasang listener `ai-chunk`; mengakumulasi stream menjadi satu baris.
- `lepasListenerGhost` (174) — **melepas** listener `ai-chunk` (dibuat untuk saat fitur dimatikan).
- `buangGhost` (191), `konteksSekitar` (197, konteks 40 baris di atas kursor).
- `mintaSaran` (208) — **titik jaringan**: memanggil `findModel`/`useAi` lalu `cmd.aiChat` (242).
- `terimaGhost` (269) — sisipkan saran utuh (Tab). `terimaSatuKata` (298) — terima satu kata (Ctrl→).
- `ghostTextKeymap` (325): `Alt-\` minta manual (327), `Tab` terima (334), `Ctrl/Cmd-ArrowRight` terima kata (340),
  `Escape` tolak (344).
- `JEDA_MS = 700` (363) + `pemicuOtomatis` (366, debounce setelah berhenti mengetik) + `batalSaatBlur` (388).
- `ghostText(on)` (399) — mengembalikan `[ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur]` bila `on`,
  `[]` bila mati. `lepasGhost` (403).

Ter-wire di editor — `src/components/editor/CodeMirrorEditor.tsx`:
- impor `ghostText, lepasGhost` (105); dipasang `out.push(...ghostText(e.ghostText))` (139);
  digerbangi `editorSettings.ghostText` (698). Editor **sudah** punya jalur dekorasi inline lain
  (`diagnosticsGutter` 65, `gitBlame` 66, `gitBars` 67, `inlayHints` 68) — jalur dekorasi inline **terbukti ada**.

Setelan — `src/lib/types.ts`: `ghostText: boolean` (1114), default **`false`** (1592);
toggle UI di `src/components/settings/SectionsBasic.tsx` (354-355).

Infra uji: **TIDAK ada test runner** (devDependencies: `typescript`, `vite`, `@tauri-apps/cli`, `autoprefixer`,
`postcss`, `tailwindcss`, `ws`, `axe-core`, ... — tanpa vitest/jest, tidak ada `*.test.ts` di `src`).
`esbuild` **ada** di `node_modules/.bin` (bawaan vite) — ini kunci rencana uji tanpa model (§6).

---

## 2. Yang KURANG (tepatnya)

1. **Tidak ada seam penyedia.** `mintaSaran` (208-262) **langsung** memakai `useAi`/`cmd.aiChat` (242).
   Tidak ada fungsi yang bisa ditukar ⇒ saran **tidak bisa** diumpankan dari sumber lokal/statis,
   dan fitur **tidak bisa** diuji tanpa kunci + model. (Permintaan tugas: "(a) TIDAK memanggil jaringan dulu".)
2. **`lepasListenerGhost` (174) diekspor tapi TIDAK dipanggil di mana pun.** Komentar di baris 130-131 dan
   172-173 mengakui maksudnya: saat fitur dimatikan, listener `ai-chunk` tetap terpasang. Ini bug jalur mati/hidup.
   (Permintaan tugas: "(b) punya jalur mati/hidup".)
3. **Tidak ada jalur uji tanpa model.** Karena (1), tidak ada satu pun cabang yang bisa dijalankan di Node.

Yang **sudah** benar dan tak perlu diutak-atik: pintasan Terima (Tab) / Terima-kata (Ctrl→) / Tolak (Escape)
sudah ada (325-351), dan pembersihan saat mengetik sudah ada (119-121).

---

## 3. Rancangan teknis minimal (React/TS)

Prinsip: **nol perintah Rust, nol jaringan di jalur default-uji**. Ini murni TS di front-end.

- **Berkas baru**: `src/lib/ghostPemasok.ts` — seam + penyedia lokal.
  ```ts
  export interface KonteksSaran { doc: string; pos: number; prefix: string; baris: number; path: string }
  export type PemasokSaran = (k: KonteksSaran) => Promise<string | null> | string | null;
  export function setPemasokSaran(fn: PemasokSaran | null): void;   // tukar-jalan
  export function pemasokSaran(): PemasokSaran;                      // ambil aktif
  export const PEMASOK_LOKAL: PemasokSaran;                          // heuristik tanpa jaringan
  export const PEMASOK_JARINGAN: PemasokSaran;                       // bungkus perilaku lama (cmd.aiChat)
  ```
  `PEMASOK_LOKAL` = heuristik murni (mis.: ulangi sufiks baris atas yang cocok, daftar kata kunci bahasa,
  atau `''` → `null` bila ragu). **Bisa diuji tanpa model.**
- **Ubah `src/lib/ghostText.ts`**: `mintaSaran` (208) memanggil `pemasokSaran()(konteks)` alih-alih
  hard-wire `cmd.aiChat`. Default tetap `PEMASOK_JARINGAN` agar perilaku lama tidak berubah; uji menyuntik
  `PEMASOK_LOKAL`/fake.
- **Perbaiki jalur mati/hidup**: di `CodeMirrorEditor.tsx` (dekat gate baris 698), saat `editorSettings.ghostText`
  berubah menjadi `false`, panggil `lepasListenerGhost()` + `buangGhost(view)`; saat berubah `true`, biarkan
  `ghostText(true)` memasang ulang (listener dipasang malas oleh `pastikanListener`, 135).
- **Bentuk data**: `{ teks: string | null; sumber: 'lokal' | 'jaringan' }` (opsional, untuk status UI).
- **Perintah Rust**: tidak ada. **Izin baru**: tidak ada.

---

## 4. Risiko + hal yang butuh webview/izin baru

- **Tidak ada permukaan webview/izin baru** di fitur ini; semuanya di renderer.
- **Regresi jaringan**: mengubah `mintaSaran` menyentuh jalur yang sudah jalan. Mitigasi: default pemasok tetap
  `PEMASOK_JARINGAN`; seam hanya menambah indirection. Uji lama (kalau ada) harus tetap hijau.
- **Bocor listener**: pastikan `lepasListenerGhost` idempoten (`listenerSiap=false`, sudah begitu di 174-178)
  supaya pemanggilan ganda aman.
- **Debounce vs streaming**: `pemicuOtomatis` (366) membatalkan timer saat mengetik; pastikan pemasok lokal
  sinkron tidak memicu debounce balik (tidak ada `dispatch` di dalam pembuatan saran).
- **Setelan default `false`** (types.ts:1592): fitur tetap opt-in. Jangan ubah default tanpa keputusan Ryu.

---

## 5. Langkah pertama yang paling kecil & bisa dibuktikan (<= 1 berkas)

**1 berkas baru: `src/lib/ghostPemasok.ts`** yang berisi `KonteksSaran`, `PemasokSaran`,
`setPemasokSaran/pemasokSaran`, dan `PEMASOK_LOKAL` (murni, tanpa impor Tauri/React).
Belum menyentuh `ghostText.ts` — seam berdiri sendiri dan langsung bisa diuji lewat harness `esbuild` (§6).
Langkah ke-2 (berkas ke-2): sambungkan `mintaSaran` ke seam.

## 6. Ukuran "jadi" yang bisa diuji (TANPA model)

Uji dijalankan sebagai harness Node (`scripts/*.mjs`), **bukan** vitest (repo tak punya runner).
Karena modulnya `.ts` murni tanpa Tauri/React, harness mentranspilasinya di memori dengan
`node_modules/.bin/esbuild` (esbuild sudah tersedia sebagai bawaan vite) → import → jalankan:

- **Uji A (seam aktif):** `setPemasokSaran(() => 'return 42')`; `pemasokSaran()` mengembalikan teks itu;
  `setPemasokSaran(null)` → kembali ke default. **Nol panggilan jaringan.**
- **Uji B (PEMASOK_LOKAL):** diberi konteks tetap, `PEMASOK_LOKAL` mengembalikan string deterministik
  (atau `null`), dan **tidak** menyentuh `cmd.aiChat` (dibuktikan dengan meng-import modul tanpa `commands`).
- **Uji C (jalur mati/hidup diuji di level unit CM6):** dengan `@codemirror/state`, dispatch `setGhost.of('xyz')`
  lalu periksa `ghostField` → `deco.size === 1`; dispatch perubahan dokumen → `deco.size === 0` (aturan baris 119-121).
- **Uji D:** `ghostText(false)` mengembalikan `[]`; `ghostText(true)` mengembalikan 4 ekstensi (399-400).
- `npx tsc --noEmit` dari `D:/Zephyr` tetap **0 error**.
  Catatan (diukur 2026-10-14): repo **belum** 0 error — 3 error sudah ada di
  `src/lib/zephyrTools/kendaliJendela.ts` (di luar lane ini). Perbaiki dulu.

Bila Ryu ingin Uji A-D permanen, itu butuh **1 berkas harness baru** (`scripts/uji-ghost-lokal.mjs`) — tidak
menyentuh kode produk.
