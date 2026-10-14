# Spesifikasi Ekosistem Ekstensi Zephyr

Rancangan jalur ekstensi Zephyr: **katalog sendiri (offline)** + **GitHub/jalur
internet (opsi Advanced)**. Dokumen ini menetapkan apa yang bisa dipakai tanpa
internet, apa yang butuh internet, bentuk paket, apa yang terjadi saat pengguna
memasang paket berkode, cara Zephyr memverifikasi asal paket, dan **arti
"terpasang"**.

- **Tanggal:** 2026-10-14 · Cabang: `feat/ai-panel-vscode-layout`
- **Status:** spesifikasi (turunan kebijakan `docs/KEPUTUSAN-MARKETPLACE-j5.md`).
- Lane ini **dokumen saja**; tidak ada berkas `src/**`/`src-tauri/**` diubah.

---

## 0. Ringkasan satu layar

| Pertanyaan | Jawaban |
|---|---|
| Bisa dipakai **tanpa internet**? | **Ya** — katalog resmi Zephyr (bawaan). |
| Butuh internet? | Hanya jalur **Advanced** (Open VSX / GitHub) yang **mati dari default**. |
| Bentuk paket yang boleh? | **Deklaratif**: `themes`, `iconThemes`, `snippets`, `keymaps`, `grammars`/bahasa. |
| Paket berkode? | **Ditolak saat pemasangan** dengan pesan jelas. |
| Verifikasi asal? | Allowlist `https` + `id_aman` + batas ukuran + kecocokan engine. |
| Arti "terpasang"? | **Ada bukti perubahan** yang bisa dihitung per jenis kontribusi. |

---

## 1. Dua sumber paket

### 1.1 Katalog resmi Zephyr (tanpa internet)

- Sumber: `src/lib/extCatalog.ts` (`KATALOG_BUNDLED`, `katalogById`) untuk sisi
  frontend, dan `src-tauri/src/ext_bundled.rs` + `ext_bundled_extra.rs` untuk
  sisi paket bawaan yang benar-benar didaftarkan.
- Paket yang muncul di katalog bawaan **wajib punya bukti perubahan saat
  terpasang** (aturan "terpasang harus berarti ada bukti berubah").
- Angka katalog sekarang: **105 paket** di worktree (88 bahasa), hasil keputusan
  melepas 13 paket bahasa yang sudah native — rujukan
  `docs/KEPUTUSAN-KATALOG-118-105.md`.

### 1.2 Jalur internet — opsi **Advanced** (mati dari default)

- Sumber luar: **Open VSX** (`open-vsx.org`), dan **GitHub mentah** bila nanti
  dibuka.
- **Default mati.** Hanya aktif kalau pengguna menyalakannya sendiri di Settings;
  saat menyala **wajib ada label "belum diuji oleh Zephyr"** + sumbernya tertulis.
- Selama **extension host** belum ada, jalur internet = **paket deklaratif saja**.

---

## 2. Bentuk paket: deklaratif vs berkode

Yang namanya VSIX = **wadah** (zip: manifest + berkas). Isinya dua macam:

| Isi paket | Bisa dipakai Zephyr? | Perlakuan |
|---|---|---|
| **Deklaratif**: `themes`, `iconThemes`, `snippets`, `keymaps`, `grammars`/bahasa | **Ya** — cuma data (JSON/CSS/tmLanguage), tidak butuh eksekusi kode | Boleh lewat jalur internet (Advanced) |
| **Berkode**: `main` / `extension.js`, `contributes.commands` yang butuh host, activation events, API `vscode.*` | **Tidak** — belum ada *extension host* | **TOLAK saat pemasangan**, jangan pasang lalu diam |

Sumber keputusan: `docs/KEPUTUSAN-MARKETPLACE-j5.md` §2.

### 2.1 Cara Zephyr menandai sebuah paket berkode

Manifest dibaca di `src-tauri/src/ext_pkg.rs`. Sebuah paket dianggap **berkode**
bila punya skrip utama; resolusi skrip ada di `skrip_utama`
(`ext_pkg.rs:526`, *"The script the extension host would run, resolved the way
`extensions_read_main` resolves it"*). Manifest native bernama
`zephyr-extension.json` (`ext_pkg.rs:16` `MANIFEST_NATIVE`). Field `main` ada di
struktur manifest (`ext_pkg.rs:122`).

---

## 3. Apa yang terjadi kalau pengguna memasang paket berkode

**Ditolak, bukan dipasang lalu nol efek.** Pesan penolakan (draf dari keputusan,
boleh disesuaikan saat implementasi):

> Paket ini berisi ekstensi berkode (menjalankan JavaScript). Zephyr belum punya
> *extension host*, jadi paket ini **belum bisa dipakai** dan tidak dipasang.
> Yang bisa dipakai: tema, icon theme, snippet, keymap, dan paket bahasa.

Konsekuensi yang diuji (butir DoD marketplace #4): paket berkode **tidak** boleh
muncul sebagai "Installed".

### 3.1 Paket campuran (sebagian didukung, sebagian tidak)

Tetap **dipasang**, tetapi daftar kontribusi yang **diabaikan wajib ditampilkan**
setelah pemasangan. Mekanismenya sudah ada: `Pengaruh { didukung, diabaikan,
ringkasan }` di `ext_pkg.rs:457–462` — `didukung` = apa yang aplikasi bisa
kerjakan (mis. jumlah warna), `diabaikan` = kontribusi yang tidak dikonsumsi
(mis. blok `contributes.menus`, `commands` tanpa `main`).

---

## 4. Cara Zephyr memverifikasi asal paket

Gerbang izin yang **sudah ada** dan **dipertahankan** (tidak dilonggarkan):

| Gerbang | Nilai / sumber |
|---|---|
| Allowlist domain | `IZIN = ["open-vsx.org", "www.open-vsx.org"]` — `ext_pkg.rs:1642` |
| Skema wajib | **https saja** (`ext_pkg.rs:1644`) |
| Batas ukuran paket | `MAX_ZEXT_BYTES = 1 GiB` (`ext_pkg.rs:10`) |
| Batas total unzip | `MAX_UNZIP_TOTAL = 2 GiB` (`ext_pkg.rs:12`) |
| Batas indeks registry | `MAX_INDEX_BYTES = 8 MiB` (`ext_registry.rs:8`) |
| Batas entri registry | `MAX_ENTRI = 500` (`ext_registry.rs:10`) |
| Id aman | `id_aman` menolak id kosong / >128 / yang bisa lolos dari folder ekstensi (`ext_pkg.rs:18`) |
| Kecocokan engine | `engine_cocok` (dipakai saat baca manifest, `ext_pkg.rs`) |

**Tidak menambah domain baru tanpa keputusan baru.** Verifikasi kriptografis
(tanda tangan paket) **sengaja belum termasuk** — lihat §7.

---

## 5. Arti "terpasang": **wajib ada bukti perubahan per jenis**

Ini tulang punggung ekosistem (aturan
`zeph-marketplace-jaminan-kepake`). "Terpasang" **bukan** berarti barisnya muncul
di daftar — artinya ada efek yang bisa diukur. Fungsi bukti sudah ada di
`src/lib/extLoader.ts`:

| Jenis paket | Bukti perubahan yang wajib terlihat | Sumber/fungsi |
|---|---|---|
| **Tema** | **warna UI** (`colors`) **+ warna kode** (`--syn-*`, 11 token) berubah | tema ekstensi harus memulihkan 11 `--syn-*`; jenis ini yang jadi ukuran "kembar" di `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` |
| **Icon theme** | **jumlah ikon** yang ikut | `jumlahIkonExt` (`src/lib/extIkonFile.ts`); hitungan `iconThemes` di ringkasan loader |
| **Snippet** | **jumlah snippet** bertambah | `jumlahSnippet()` (`extLoader.ts:288`) |
| **Keymap** | **jumlah pintasan** yang berubah | `keymapEkstensi()` (`extLoader.ts:186`) |
| **Bahasa** | **mode yang aktif** | `bahasaEkstensi()` (`extLoader.ts:294`), `bahasaUntukExt` (`extLoader.ts:296`) |

Ringkasan pemuatan ekstensi (`ExtLoadSummary` di `extLoader.ts:53–67`) memisahkan
tiga keadaan supaya jujur bedanya:

- **`tidakDidukung`** — paket baik tapi fiturnya belum didukung (beda dari
  "rusak"); contoh: grammar tidak tersedia (`extLoader.ts:361`), keymap merujuk
  command yang tidak ada (`extLoader.ts:218`).
- **`gagal`** — paket memang rusak.
- hitungan yang berhasil (`commands`, `iconThemes`, dsb.) — bukti nyata.

### 5.1 Aturan khusus paket bahasa (native menang)

`src/lib/lang.ts:111`:

```ts
if (detectLang(nameOrPath) !== 'plain') return null;
return bahasaUntukExt(ext);
```

Artinya **peta bawaan (`BY_EXT`) menang** untuk setiap ekstensi yang sudah
dikenalnya; grammar dari paket hanya dipakai untuk ekstensi yang tidak diklaim
siapa pun. Karena itu 13 paket bahasa dilepas (tidak pernah aktif) — rujukan
`docs/KEPUTUSAN-KATALOG-118-105.md` §2.

---

## 6. Uninstall

Butir DoD marketplace #6: uninstall → keadaan kembali seperti sebelum dipasang,
dan Zephyr **melaporkan apa yang dikembalikan** (warna, jumlah ikon, snippet,
pintasan, mode). Tidak ada penghapusan diam-diam.

---

## 7. Yang SENGAJA tidak termasuk sekarang (jujur, bukan lupa)

Sumber: `docs/KEPUTUSAN-MARKETPLACE-j5.md` §5.

- **Extension host** (menjalankan ekstensi berkode). Belum ada, tidak dikerjakan.
  Selama belum ada, jalur internet = paket deklaratif saja.
- **Publikasi paket Zephyr ke Open VSX.**
- **Tanda tangan/verifikasi kriptografis paket** — bisa item terpisah kalau jalur
  internet dipakai serius.

---

## 8. Rujukan berkas

- Kebijakan: `docs/KEPUTUSAN-MARKETPLACE-j5.md`
- Katalog: `docs/KEPUTUSAN-KATALOG-118-105.md`, `src/lib/extCatalog.ts`,
  `src-tauri/src/ext_bundled.rs`, `ext_bundled_extra.rs`
- Pemasangan/verifikasi: `src-tauri/src/ext_pkg.rs`,
  `src-tauri/src/ext_registry.rs`
- Bukti perubahan (frontend): `src/lib/extLoader.ts`, `src/lib/extIkonFile.ts`,
  `src/lib/lang.ts`, `src/lib/cmLegacyModes.ts`, `src/lib/extensionsStore19.ts`,
  `src/components/extensions/ExtensionsView.tsx`,
  `src/components/settings/SectionsExtensions.tsx`
- Keputusan kembar tema (contoh kasus "warna kode"): `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`
- Catatan sesi: `docs/CATATAN-KEPUTUSAN-SESI-2026-10-14.md`
