# Keputusan Marketplace Zephyr — item `j5`

- **Tanggal:** 2026-10-14
- **Pemutus:** Ryu
- **Status:** DIPUTUSKAN — Opsi **C** (hybrid, internet mati dari default)
- **Sifat:** kebijakan + gerbang izin; bukan rombak arsitektur

## 1. Keputusan

**Opsi C — hybrid.**

1. **Default = katalog resmi Zephyr.** Tab Marketplace tanpa diubah isinya cuma menampilkan paket yang Zephyr kurasi/ikat sendiri. Semua yang muncul di situ wajib punya bukti perubahan saat terpasang.
2. **Jalur internet = opsi Advanced, MATI dari default.** Sumber luar (Open VSX, dan GitHub mentah bila nanti dibuka) hanya aktif kalau pengguna menyalakannya sendiri di Settings, dan saat menyala wajib ada label "belum diuji oleh Zephyr".
3. **Paket berkode ditolak, bukan dipasang lalu nol efek.** Ini inti jawaban atas keberatan "kan Zephyr nggak bisa VSIX".

## 2. Arti "jalur internet" itu apa — dan apa yang TIDAK bisa

Yang namanya VSIX itu **wadah** (zip: manifest + berkas). Isinya ada dua macam, dan perlakuannya beda:

| Isi paket | Bisa dipakai Zephyr? | Perlakuan |
|---|---|---|
| **Deklaratif**: `themes`, `iconThemes`, `snippets`, `keymaps`, `grammars`/bahasa | **Ya** — cuma data (JSON/CSS/tmLanguage), nggak butuh mengeksekusi kode | Boleh lewat jalur internet (Advanced) |
| **Berkode**: `main` / `extension.js`, `contributes.commands` yang butuh host, activation events, API `vscode.*` | **Tidak** — belum ada *extension host* | **TOLAK saat pemasangan** dengan pesan jelas, jangan pasang lalu diam |

Pesan penolakan (draf, boleh disesuaikan saat implementasi):

> Paket ini berisi ekstensi berkode (menjalankan JavaScript). Zephyr belum punya *extension host*, jadi paket ini **belum bisa dipakai** dan tidak dipasang. Yang bisa dipakai: tema, icon theme, snippet, keymap, dan paket bahasa.

Paket **campuran** (sebagian didukung, sebagian tidak): tetap dipasang, tapi daftar kontribusi yang diabaikan **wajib ditampilkan** setelah pemasangan.

## 3. Gerbang izin yang sudah ada (dipertahankan, tidak dilonggarkan)

- Allowlist domain di `src-tauri/src/ext_pkg.rs` (`IZIN`) = `open-vsx.org`, `www.open-vsx.org`, **https saja**. Tidak menambah domain baru tanpa keputusan baru.
- Batas ukuran paket (`MAX_ZEXT_BYTES`) dan indeks (`MAX_INDEX_BYTES`) di `ext_registry.rs` tetap berlaku.
- Pemeriksaan id (`id_aman`) dan kecocokan engine tetap berlaku.

## 4. Tolok ukur "jadi" (Definition of Done untuk opsi C)

1. Saklar Advanced ada di Settings, **default mati**, dan keadaannya tersimpan.
2. Saklar mati → tab Marketplace hanya menampilkan katalog resmi (dan tetap ada isinya, bukan kosong).
3. Saklar nyala → hasil dari sumber luar muncul dengan label "belum diuji" + sumbernya (Open VSX/GitHub) tertulis.
4. Paket berkode → ditolak dengan pesan di atas, dan **tidak** muncul sebagai "Installed".
5. Paket deklaratif → setelah dipasang ada **bukti perubahan** (tema: warna UI + warna kode; icon theme: jumlah ikon; snippet: jumlah snippet; keymap: jumlah pintasan yang berubah; bahasa: mode yang aktif).
6. Uninstall → keadaan kembali seperti sebelum dipasang, dan Zephyr melaporkan apa yang dikembalikan.

## 5. Yang SENGAJA tidak termasuk sekarang (jujur, bukan lupa)

- **Extension host** (menjalankan ekstensi berkode). Belum ada, tidak dikerjakan di item ini. Selama belum ada, jalur internet = paket deklaratif saja.
- Penerbitan/publikasi paket Zephyr ke Open VSX.
- Tanda tangan/verifikasi kriptografis paket (bisa jadi item terpisah kalau nanti jalur internet dipakai serius).

## 6. Kaitan dengan item lain

- `zeph-marketplace-jaminan-kepake` — aturan "terpasang harus berarti ada bukti berubah" (ini tulang punggungnya).
- `zeph-marketplace-katalog-118-105` — keputusan terpisah: 13 paket bahasa **dibiarkan dibuang** karena sudah didukung bawaan; alasannya ditulis di katalog, UI bilang "sudah didukung bawaan", ikon ketinggalan di `ext_lang_icons.rs` dibersihkan.
- Penutup lubang "terpasang tapi nol efek" di sisi Rust/UI (penghitungan kontribusi didukung vs diabaikan) — prasyarat nomor 4, 5, dan 6 di atas.
