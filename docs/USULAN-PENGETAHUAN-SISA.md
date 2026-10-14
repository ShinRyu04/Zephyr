# USULAN PENGETAHUAN SISA — 2026-10-14

Usulan patch untuk tiga item sisa pengetahuan. Semua nomor baris di bawah adalah
nomor baris **nyata** yang saya baca di tree ini (2026-10-14), bukan perkiraan.

Saya **tidak** menerapkan patch di dokumen ini. Berkas yang saya sentuh pada sesi
ini hanya `scripts/uji-peta-kode.mjs`,
`scripts/uji-pengetahuan-dua-lapis.mjs`, `docs/LAPORAN-PENGETAHUAN-SISA.md`, dan
dokumen ini.

---

## 0. Aturan yang mengikat usulan ini

**(a) Teks Inggris harus tetap byte-identical.** Ini bukan selera saya — sudah
ada gate yang memakunya:

| Gate | Baris | Yang dipaku |
| --- | --- | --- |
| `scripts/cek-runtime-sadar-live.mjs` | 108, 135, 377, 384 | `` "# Zephyr's live state" `` (kepala blok) |
| `scripts/cek-runtime-sadar-live.mjs` | 326 | `This block wins over any stale note about Zephyr above it` (baris aturan) |
| `scripts/uji-keadaan-prompt.mjs` | 310 | `const KEPALA_LIVE = "# Zephyr's live state"` |

Karena itu setiap tabel di bawah memakai `en:` = **salinan persis** string lama.
Kalau `en` diubah, ketiga rujukan itu harus diubah bersamaan — dan
`cek-runtime-sadar-live.mjs` adalah gate **BUTUH APP** (membaca
`window.__ZEPHYR_PROMPT__`), jadi kesalahannya baru ketahuan di app.

**(b) Tidak boleh impor silang `systemPrompt`.** `systemPrompt.ts:138
blokKeadaanPrompt()` memanggil `blokKeadaan()` dari `./zephyrRuntime` dan
`blokKeadaanRingkas()` dari `./aiZephyrState`. Jadi `zephyrRuntime.ts` dan
`aiZephyrState.ts` **tidak boleh** `import { kodeBahasaPrompt } from './systemPrompt'`
→ siklus modul. Keduanya butuh penolong lokal kecil yang membaca store yang sama
(`useStore.getState().settings?.general?.uiLang`), persis seperti
`systemPrompt.ts:78–85 kodeBahasaPrompt()` dan penolong `perBahasa()` di
`systemPrompt.ts:88 function perBahasa<T>(tabel: Record<string, T>, inggris: T): T`
— tiru keduanya apa adanya (nama, bentuk, fallback ke `en`).

**(c) Anggaran blok inti sudah mepet.** Terukur: 1953/2000 token, **sisa 47
token** (`docs/LAPORAN-PENGETAHUAN-SISA.md` §2). Blok keadaan punya batasnya
sendiri (`zephyrRuntime.ts:33 BATAS_KEADAAN = 900` char) dan plafon promptnya
(`systemPrompt.ts:26 BATAS_KEADAAN_PROMPT = 3600` char). Karena itu usulan teks
`id` di bawah sengaja dibuat **tidak lebih panjang** dari `en`-nya.

**(d) Ini aturan repo yang sudah tertulis, bukan gagasan saya.**
`systemPrompt.ts:39–43` menyatakannya sendiri untuk kepala potret: "…harness
mencocokkan kepala ini apa adanya - jadi lokalisasi tidak menambah panjang prompt
bahasa Inggris sama sekali, dan hanya bahasa yang punya terjemahan yang berubah.
Bahasa lain jatuh ke teks Inggris (sumber kebenaran di sini), bukan ke teks
Indonesia." Patch A dan Patch B di bawah mengikuti aturan itu — termasuk fallback
ke `en`, bukan ke `id`.

**Catatan nomor baris.** Semua nomor dibaca pada 2026-10-14, dan worktree ini
sedang dikerjakan beberapa aliran sekaligus, jadi nomor bisa bergeser: dalam sesi
ini saja `faktaInti` berpindah 802 → 806 dan `blokKeadaanPrompt` 137 → 138.
Periksa ulang sebelum menerapkan:

```
node scripts/uji-peta-kode.mjs          # mencetak sampel `simbol@baris` nyata
grep -n "export function blokKeadaanPrompt" src/lib/systemPrompt.ts
grep -n "kepalaBlokKeadaan\|blokKeadaan" src/lib/zephyrRuntime.ts
```

---

## 1. Patch A — lokalisasi teks blok keadaan (`src/lib/zephyrRuntime.ts`)

Menutup `AI-TAHU-100-2-SISA`, bagian terbesar. 24 string Inggris di satu berkas.

### A.1 Sisipkan penolong bahasa setelah baris 39

```ts
// zephyrRuntime.ts, setelah baris 39 (const MAKS_TAB_PANEL = 5;)
//
// Penolong bahasa LOKAL: tidak mengimpor `kodeBahasaPrompt()` dari
// `./systemPrompt` karena berkas itu yang mengimpor `blokKeadaan()` dari sini
// (siklus modul). Membaca store yang sama, jadi pindah bahasa di Setelan
// berlaku di giliran berikutnya.
function kodeBahasa(): string {
  try {
    const lang = String(useStore.getState().settings?.general?.uiLang || 'en');
    return lang.toLowerCase().slice(0, 2) || 'en';
  } catch {
    return 'en';
  }
}

/** Pilih entri tabel bahasa; jatuh ke `en` untuk bahasa yang belum diterjemahkan. */
function perBahasa(tabel: Record<string, string>, lang = kodeBahasa()): string {
  return tabel[lang] ?? tabel.en;
}
```

`useStore` sudah diimpor di `zephyrRuntime.ts:23`, jadi tidak ada impor baru.

### A.2 Tabel + hunk

Mekaniknya (contoh untuk tiga hunk pertama; sisanya sama bentuknya):

```ts
// LAMA  zephyrRuntime.ts:228-230
export function kepalaBlokKeadaan(): string {
  return "# Zephyr's live state - read from this running app for this turn";
}

// BARU
const KEPALA_KEADAAN_HIDUP: Record<string, string> = {
  en: "# Zephyr's live state - read from this running app for this turn",
  id: '# Keadaan hidup Zephyr - dibaca dari aplikasi yang sedang jalan, untuk giliran ini',
};
export function kepalaBlokKeadaan(): string {
  return perBahasa(KEPALA_KEADAAN_HIDUP);
}
```

```ts
// LAMA  zephyrRuntime.ts:246  (string aturan, satu baris utuh)
'This block wins over any stale note about Zephyr above it. Never ask which folder, file or setting is in use: it is here.'

// BARU
perBahasa({
  en: 'This block wins over any stale note about Zephyr above it. Never ask which folder, file or setting is in use: it is here.',
  id: 'Blok ini menang atas catatan lama soal Zephyr di atasnya. Jangan tanya folder, berkas, atau setelan mana yang sedang dipakai: semuanya ada di sini.',
})
```

```ts
// LAMA  zephyrRuntime.ts:50  (isi daftar(), verbatim)
  return pakai.join(', ') + (sisa > 0 ? ` and ${sisa} more` : '');

// BARU
  return pakai.join(', ') + (sisa > 0
    ? `${perBahasa({ en: ' and ', id: ' dan ' })}${sisa}${perBahasa({ en: ' more', id: ' lagi' })}`
    : '');
```

Sisa 21 string, satu baris usulan per baris:

| Baris | String lama (en, verbatim) | Kunci usulan | String baru (id) |
| --- | --- | --- | --- |
| 60 | `update: up to date` | `ai.state.update.terbaru` | `update: terbaru` |
| 63 | `` `${versi} available` `` | `ai.state.update.tersedia` | `` `${versi} tersedia` `` |
| 66 | `` `downloading ${p}%` `` | `ai.state.update.mengunduh` | `` `mengunduh ${p}%` `` |
| 69 | `` `${versi} ready, installs on restart` `` | `ai.state.update.siap` | `` `${versi} siap, terpasang saat mulai ulang` `` |
| 72 | `update: checking now` | `ai.state.update.memeriksa` | `update: sedang memeriksa` |
| 75 | `update: not configured in this build` | `ai.state.update.takAda` | `update: tidak tersedia di build ini` |
| 78 | `` `update: check failed (${e})` `` | `ai.state.update.gagal` | `` `update: pemeriksaan gagal (${e})` `` |
| 81 | `update: not checked yet` | `ai.state.update.belum` | `update: belum diperiksa` |
| 86 | `` `update: just updated to ${v}, release notes pending` `` | `ai.state.update.baru` | `` `update: baru saja ke ${v}, catatan rilis menyusul` `` |
| 88 | `` `- App: Zephyr ${versi} (${upd})` `` | `ai.state.label.app` | `` `- App: Zephyr ${versi} (${upd})` `` (nama produk + `App` sengaja tetap) |
| 96 | `- Workspace: no folder open (no project root, so path-bound tools have none)` | `ai.state.workspace.kosong` | `- Workspace: tak ada folder dibuka (tanpa akar proyek, jadi tool berbasis jalur tidak punya)` |
| 103 | `` `- Workspace: ${ws} - ${n} tab(s)` `` | `ai.state.workspace.isi` | `` `- Workspace: ${ws} - ${n} tab` `` |
| 104 | `, M unsaved` | `ai.state.workspace.belumSimpan` | `, M belum disimpan` |
| 105 | `; active file X` | `ai.state.workspace.aktif` | `; berkas aktif X` |
| 115 | `` `- Layout: sidebar=${s} ${tampil}; AI panel=${p} column ${tampil}; bottom panel shows ${a} of ${b}` `` | `ai.state.label.layout` | `` `- Layout: sidebar=${s} ${tampil}; panel AI=${p} kolom ${tampil}; panel bawah menampilkan ${a} dari ${b}` `` |
| 132 | `- Extensions: none installed beyond Zephyr's built-ins` | `ai.state.ekstensi.kosong` | `- Ekstensi: tidak ada selain bawaan Zephyr` |
| 139 | `` `- Extensions on: ${daftar} (${n} installed` `` | `ai.state.ekstensi.aktif` | `` `- Ekstensi aktif: ${daftar} (${n} terpasang` `` |
| 140 | `, M failed` | `ai.state.ekstensi.gagal` | `, M gagal` |
| 141 | `, built-ins excluded)` | `ai.state.ekstensi.kecualiBawaan` | `, bawaan tidak dihitung)` |
| 146 | `` `- Extension FAILED to load: ${x}` `` | `ai.state.ekstensi.gagalMuat` | `` `- Ekstensi GAGAL dimuat: ${x}` `` |
| 149 | `` `- ...and ${n} more extension(s) failed to load` `` | `ai.state.ekstensi.gagalLain` | `` `- ...dan ${n} ekstensi lain gagal dimuat` `` |
| 151 | `` `- Extension system error: ${e}` `` | `ai.state.ekstensi.galatSistem` | `` `- Galat sistem ekstensi: ${e}` `` |
| 164 | `` `- LSP: off in settings (still running: ${x})` `` | `ai.state.lsp.matiTetapJalan` | `` `- LSP: mati di setelan (masih jalan: ${x})` `` |
| 169 | `` `${id} installed` `` / `` `${id} missing (${x})` `` | `ai.state.lsp.ada` / `ai.state.lsp.hilang` | `` `${id} terpasang` `` / `` `${id} tidak ada (${x})` `` |
| 171 | `` `- LSP: running ${x}; probe: ${y}` `` / `not run yet` | `ai.state.lsp.jalan` / `ai.state.lsp.belum` | `` `- LSP: jalan ${x}; probe: ${y}` `` / `belum dijalankan` |
| 181 | `Zephyr's own MCP server is on at 127.0.0.1:P` | `ai.state.mcp.hidup` | `server MCP Zephyr sendiri hidup di 127.0.0.1:P` |
| 182 | `off (requested port P)` | `ai.state.mcp.mati` | `mati (port diminta P)` |
| 184 | `state not read yet; settings say on/off (port P)` | `ai.state.mcp.belum` | `keadaan belum dibaca; setelan bilang hidup/mati (port P)` |
| 191 | `` `- MCP: ${ringkas}` `` | `ai.state.label.mcp` | `` `- MCP: ${ringkas}` `` (akronim tetap) |
| 193 | `` `; ${n} external server(s): ${x}` `` | `ai.state.mcp.luar` | `` `; ${n} server luar: ${x}` `` |
| 194 | `; no external MCP servers configured` | `ai.state.mcp.tanpaLuar` | `; tidak ada server MCP luar` |
| 201 | `- Settings: not loaded yet` | `ai.state.setelan.belum` | `- Setelan: belum dimuat` |
| 214 | `` `- Settings in use: ${x}` `` | `ai.state.setelan.dipakai` | `` `- Setelan berlaku: ${x}` `` |

Catatan penerapan:

- Kalau pemilik memilih menyatukan kunci di kamus yang sudah ada
  (`systemPrompt.ts:44 KEPALA_KEADAAN`, `:55 UMUR_KEADAAN`, `:61 BARIS_RIWAYAT`),
  pola tabel `Record<string, string>` di atas tetap sama — cukup pindahkan
  tabelnya. Jangan mengimpor dari `systemPrompt` (aturan 0b).
- Panjang `id` di atas ≤ `en` untuk semua baris yang saya usulkan, supaya sisa 47
  token tidak tergerus. Yang paling berisiko adalah baris 96 dan 115 (kalimat
  panjang); keduanya masih lebih pendek dari `en`.

---

## 2. Patch B — `src/lib/aiZephyrState.ts` (utamakan yang terlihat)

Berkas ini **seluruh labelnya Indonesia tetap** dan tidak ikut `uiLang` — untuk
pengguna `en` ini salah bahasa, dan untuk pengguna `id` ia bertabrakan di dalam
prompt yang sama dengan blok Inggris Patch A.

**Tahap 1 (murah, paling terlihat) — 2 string:**

```ts
// LAMA  aiZephyrState.ts:539
export const PENANDA_POTONG = '… (terpotong)';

// BARU  — samakan dengan pasangan yang sudah ada di systemPrompt.ts:67 AKHIR_TERPOTONG
export const PENANDA_POTONG: Record<string, string> = {
  en: '\n… (truncated)',
  id: '\n… (dipotong)',
};
```

```ts
// LAMA  aiZephyrState.ts:550-552
export function kepalaKeadaan(): string {
  return 'ZEPHYR · KEADAAN RUNTIME';
}

// BARU
const KEPALA_KEADAAN_POTRET: Record<string, string> = {
  en: 'ZEPHYR · RUNTIME STATE',
  id: 'ZEPHYR · KEADAAN RUNTIME',
};
export function kepalaKeadaan(): string {
  return perBahasa(KEPALA_KEADAAN_POTRET);
}
```

Butuh penolong `kodeBahasa()`/`perBahasa()` yang sama seperti Patch A.1 di berkas
ini (aturan 0b: jangan impor dari `systemPrompt`).

**Peringatan breaking:** `PENANDA_POTONG` hari ini `string`; mengubahnya jadi
`Record<string,string>` memecah tiap pemakaian `.length`/penggabungan string di
`ringkasKeadaan()` dan di harness yang menyematkannya (`cek-batas-inti.mjs`,
`cek-pengetahuan-2lapis.mjs`). Kalau itu terlalu berisiko untuk satu item, opsi
kedua: **biarkan `PENANDA_POTONG` apa adanya** dan cukup tambahkan fungsi
`penandaPotong(lang)` baru, lalu pindahkan pemakaian ke sana. Saya tandai ini
karena `systemPrompt.ts` sudah punya `AKHIR_TERPOTONG` berpasangan en/id — dua
penanda potong untuk keadaan yang sama adalah duplikasi yang sebaiknya
disatukan, bukan ditambah.

**Tahap 2 (besar, usulan item tersendiri `AI-TAHU-100-2-LANJUTAN`):** ~40 label
Indonesia tetap di `aiZephyrState.ts:434–512` (daftar lengkap dengan nomor baris
ada di `docs/LAPORAN-PENGETAHUAN-SISA.md` §4b). Ini 3–4× pekerjaan Patch A dan
menyentuh berkas yang bukan milik saya, jadi saya usulkan tidak digabung ke item
ini.

---

## 3. Patch C — peta kode basi (bukan suntingan; wewenang pemilik)

Ini **bukan** patch teks. Gate AI-TAHU-100-8 sudah hijau (24/24), yang basi
artefaknya:

```
PETA KODE BASI: 25 berkas baru belum masuk, 0 kunci hantu, 30 teks meleset
(peta segar 429 berkas, artefak 404 entri kode).
```

Perbaikan (satu perintah, harus dijalankan pemilik artefak generated — saya
dilarang regenerate):

```
node scripts/gen-fakta-zephyr.mjs
node scripts/uji-peta-kode.mjs --check   # harapan: exit 0, "PETA KODE SINKRON"
node scripts/cek-indeks-sinkron.mjs      # harness yang sekarang MERAH/basi
```

Saran: jadikan `uji-peta-kode.mjs --check` bagian dari pemeriksaan rutin supaya
peta tidak diam-diam tertinggal lagi — peta yang basi membuat model menjawab
"fungsi itu tidak ada" untuk berkas yang sudah ada.

---

## 4. Patch D — daftarkan dua gate baru (berkas bukan milik saya)

`scripts/uji-kesehatan-semua.mjs` (jangan ditimpa, ini usulan) sebaiknya memanggil
dua gate baru supaya ikut di jalur kesehatan:

```
node scripts/uji-peta-kode.mjs            # AI-TAHU-100-8
node scripts/uji-pengetahuan-dua-lapis.mjs # AI-TAHU-100-7
```

Keduanya deterministik, tidak butuh app, dan keluar `0` saat hijau — jadi aman
masuk jalur cepat.

---

## 5. Verifikasi setelah patch diterapkan

| Perintah | Harapan |
| --- | --- |
| `node scripts/uji-pengetahuan-dua-lapis.mjs` | tetap 27/27; A4/A5 tetap ≤2000 (bukti `id` tidak menggerus anggaran) |
| `node scripts/cek-batas-inti.mjs` | hijau; blok inti masih ≤2000 token |
| `node scripts/uji-peta-kode.mjs` | tetap 24/24 |
| `node scripts/gen-fakta-zephyr.mjs && node scripts/uji-peta-kode.mjs --check` | peta sinkron (exit 0) |
| `node scripts/uji-keadaan-prompt.mjs` | hijau; `KEPALA_LIVE = "# Zephyr's live state"` masih cocok → membuktikan `en` byte-identical |
| `node scripts/cek-runtime-sadar-live.mjs` | **BUTUH APP** — baru bisa diverifikasi dengan Zephyr berjalan |
| `npx tsc --noEmit` | exit 0, 0 baris (siapkan catatan: run pertama bisa memunculkan galat fantom dari keadaan inkremental yang tertinggal; run kedua bersih) |

Kalau `uji-keadaan-prompt.mjs` atau `cek-runtime-sadar-live.mjs` merah setelah
patch, berarti `en` bergeser — kembalikan `en` ke salinan persis di tabel, jangan
ubah harness-nya.

---

## 6. Urutan pengerjaan yang saya usulkan

1. **Patch C** (regenerate peta) — satu perintah, langsung menutup bagian artefak
   dari AI-TAHU-100-8 dan menghijaukan `cek-indeks-sinkron.mjs`.
2. **Patch A** (zephyrRuntime.ts) — menutup bagian terbesar AI-TAHU-100-2-SISA.
3. **Patch B tahap 1** (2 string `aiZephyrState.ts`).
4. **Patch D** (registrasi gate).
5. **Patch B tahap 2** — item tersendiri.
