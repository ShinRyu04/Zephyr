# LAPORAN TEMUAN EKSTENSI — B

**Item:** `ZEPH-KEYMAP-MERGE-SATU-CHORD` (chord kembar: gabung + alias, bukan tumpang-tindih)
**Cabang:** `feat/ai-panel-vscode-layout`
**Harness baru:** `scripts/uji-keymap-chord-gabung.mjs` → **17/17 LULUS**
**Berkas implementasi:** `src/lib/keybindings.ts` (+295 / −39 baris)

Cara menjalankan:

```bash
node scripts/uji-keymap-chord-gabung.mjs      # 17 kasus, exit 0 = lulus
node scripts/uji-keymap-live.mjs              # 37/37 masih hijau (regresi)
npx tsc --noEmit                              # 0 galat
```

Harness menguji **fungsi asli** `src/lib/keybindings.ts` (dibundel esbuild ke folder scratch lalu diimpor — pola yang sama dengan `uji-keymap-live.mjs`), dan membaca chord paket keymap langsung dari berkas Rust tempat katalognya di-embed (`ext_bundled_extra.rs` untuk Vim/Emacs/JetBrains, `ext_bundled.rs` untuk Sublime). Jadi angkanya angka nyata aplikasi ini, bukan angka karangan.

---

## 1. Masalah

Dua pintasan atau lebih bisa memakai **satu chord yang sama**. Sebelumnya baris-baris itu cuma hidup berdampingan dan yang kalah **tertutup tanpa jejak**: tidak terlihat di data, tidak bisa dicari, dan tidak ada satu pun laporan yang menyebutkan bahwa satu aksi kini tidak akan pernah jalan. Bawaan aplikasi pun sudah mengandung chord kembar (`Ctrl+Shift+O`, `F11`), dan paket keymap menambah lagi.

## 2. Yang dikerjakan

`src/lib/keybindings.ts` — penggabungan bersifat **MENAMBAH**, tidak ada baris yang dibuang:

| Bagian | Isi |
|---|---|
| `mergeBindings` | tiap baris diberi `chordAlias: string[]` — nama-nama lain yang menempati chord itu. Baris **tidak dihapus**: resolver memang butuh satu baris per `when` supaya chord tetap hidup di konteks asalnya. |
| `gabungChordKembar(bindings)` | tabel kanonik **satu entri per chord** + laporan angka. Deterministik: urutan entri ikut kemunculan pertama, alias menaruh pemenang resolver lebih dulu. |
| `tabelEfektif` / `entriChord` | akses tabel/entri per chord. |
| `cariPintasan(nama)` | cari pintasan lewat **nama lama** maupun chord; gerbang “tidak ada pintasan yang hilang”. |
| `resolveChord(entry, ctx)` | semantik identik `resolveBinding`; dipakai harness untuk membuktikan perilaku tidak berubah. |
| `chordConflicts` | kini dibaca dari tabel kanonik, jadi partner kembar tetap terlihat walau urutan baris berubah. |

`chordAlias` aman ditambahkan: `keybindingStore` menyebar baris, `KeybindingsEditor` me-render kunci `${command}-${chord}`, `setKeybindings(user)` menulis `user` (bukan `bindings`), dan `devBridge` hanya membaca chord/command/when/source.

## 3. Bukti nyata (angka dari harness)

```
DEFAULT_BINDINGS: 92 baris -> 92 baris berchord
paket keymap: 4 (Keymap ala Vim, Emacs-style keymap, JetBrains-style keymap, Sublime-style Keymap) - 37 chord paket

angka bawaan: chord 90, kembar 2, nama 92,  konflik 0
angka paket : chord 120, kembar 4, nama 124, konflik 2
nama unik   : bawaan 91 -> paket 94 (tidak boleh turun)
baris 124 -> entri chord 120 (turun 4 karena penggabungan, bukan penghapusan)
```

### Tabel chord kembar SEBELUM → SESUDAH

| Chord | SEBELUM (baris apa adanya) | SESUDAH (satu entri) | Status |
|---|---|---|---|
| `Ctrl+Shift+O` | `file.openFolder`@global, `editor.gotoSymbol`@editorFocus | 1 entri, 2 alias, **0 konflik** | damai — `when` berbeda, dua-duanya tetap jalan |
| `F11` | `window.fullscreen`@global, `debug.stepInto`@debugActive | 1 entri, 2 alias, **0 konflik** | damai — `when` berbeda |
| `Ctrl+S` | `edit.find`@global (paket Emacs), `file.save`@global | 1 entri, 2 alias, **1 konflik** → `file.save` tertutup | **BENTROK** — dilaporkan sebagai temuan |
| `Ctrl+Shift+A` | `view.palette`@global (paket JetBrains), `ai.panel`@global | 1 entri, 2 alias, **1 konflik** → `ai.panel` tertutup | **BENTROK** — dilaporkan sebagai temuan |

Entri kembar **bukan** penghapusan: 124 baris → 120 entri karena 4 chord memuat 2 nama masing-masing (4 baris “hilang” dari hitungan entri, nol nama yang hilang dari hitungan nama).

### Gerbang superset (kriteria MERAH-HIJAU)

| Skenario | nama unik sebelum | nama unik sesudah | hilang | hasil |
|---|---|---|---|---|
| bawaan (`mergeBindings([], [])`) | 91 | 91 | 0 | LULUS |
| 4 paket keymap terpasang | 94 | 94 | 0 | LULUS |
| kontrol negatif (1 nama dihapus paksa) | 91 | 90 | 1 (`editor.gotoSymbol`) | **MERAH** ← gerbangnya memang bekerja |

Tiap nama lama diuji satu per satu lewat `cariPintasan`: 91/91 (bawaan) dan 94/94 (paket) ketemu, 0 tak ketemu. Ditambah: 8 baris runtime membawa `chordAlias` (mis. `Ctrl+S file.save -> edit.find`).

### Yang terbukti TIDAK berubah

`resolveChord == resolveBinding` untuk **1050 kombinasi chord × konteks** (2 tabel × 5 konteks: global, editorFocus, terminalFocus, debugActive, semua) → **0 beda**. Penggabungan tidak mengubah chord mana memicu apa; ia hanya membuat pintasan kembar terlihat dan bisa dicari. `chordConflicts` juga disamakan dengan tabel untuk **216 alias** → 0 beda.

Deterministik & idempotent: dua kali bangun = identik; masukan dibalik → himpunan chord dan angka kembar sama, `F11` tetap 2 alias dengan pemenang tetap `window.fullscreen`; menggabung ulang tabel yang sudah gabung tidak mengubah apa pun (120 entri/124 alias/2 konflik).

`node scripts/uji-keymap-live.mjs` tetap **37/37 LULUS** (0 pelanggaran assertion) dan `npx tsc --noEmit` **0 galat**.

## 4. Temuan (bukan bug yang disembunyikan)

1. **`Ctrl+S` bentrok sejati.** Paket Emacs memetakan `Ctrl+S` → `workbench.action.terminal.focusFind` → alias `edit.find` **global**, sedangkan default `Ctrl+S` = `file.save` **global**. `resolveBinding` cuma sampai baris pertama (baris paket di-`splice` di depan baris bawaan) → `edit.find` menang, `file.save` tertutup di `when` yang sama. Sebelum perubahan pun begitu — penggabungan hanya membuatnya **kelihatan**. Kini `file.save` tetap ada sebagai alias dan `chordConflicts('edit.find','Ctrl+S','global') = ['file.save']`.
2. **`Ctrl+Shift+A` bentrok sejati.** Paket JetBrains `Ctrl+Shift+A` → `view.palette` global vs default `ai.panel` global → `ai.panel` tertutup, dilaporkan.
3. **Dua bentrok itu keputusan produk, bukan keputusan kode.** Memilih pemenangnya (paket menang? bawaan menang? tanya pengguna saat konflik?) mengubah perilaku pengguna, jadi tidak diputuskan sepihak di sini.

## 5. Rujukan temuan saudara (SUDAH SELESAI di lane lain — tidak diulang)

- **`zeph-label-sudah-didukung`** — `src/lib/labelPaket.ts` + `scripts/uji-katalog-ekstensi-jujur.mjs` (**20/20**) + `docs/KATALOG-EKSTENSI-JUJUR.md`. Perl/python/ruby/shell/xml terbukti “sudah didukung bawaan” — paketnya cuma menambah ekstensi sisa.
- **`zeph-bahasa-noop-puppet`** — `scripts/uji-bahasa-live.mjs`: 88 paket → **87 efektif, 1 no-op, 0 gagal**; `zephyr.lang-puppet` no-op karena `.pp` sudah direbut `zephyr.lang-pascal`.
- **`zeph-ikon-ketinggalan-12`** — `scripts/uji-ikon-bersih.mjs` (**4/4**), `docs/IKON-KETINGGALAN-12.md`; halaman tema **70/70** (`scripts/uji-halaman-tema.mjs`).

Tidak ada harness baru yang dibuat untuk ketiga hal di atas; laporan ini hanya merujuk angkanya.

## 6. Sisa yang BUTUH APP

1. **UI “chord ini juga dipakai …”.** `chordAlias` sudah menempel di baris, tapi `KeybindingsEditor.tsx` belum menampilkannya (READ-ONLY bagi lane ini). Usulan patch: pada tiap baris, bila `b.chordAlias?.length`, render badge `juga: ${b.chordAlias.join(', ')}`. Verifikasi tampilan butuh app jalan.
2. **Ekspos lewat devBridge.** `devBridge` bisa menambahkan `chordAlias`/`konflik` per baris supaya harness BERBASIS-APP (CDP) bisa memeriksa tabel yang sama seperti harness bundel ini. Belum diubah (READ-ONLY).
3. **Keputusan pemenang `Ctrl+S` dan `Ctrl+Shift+A`** (§4) — perlu keputusan produk/UX + verifikasi langsung: tekan `Ctrl+S` di terminal dengan paket Emacs terpasang, lihat apakah yang jalan `edit.find` atau `file.save`.
4. **`verify18.mjs` belum hijau penuh, dan itu BUKAN dari perubahan ini.** V8 (menu menunjuk command yang fiturnya belum ada) GAGAL dan skrip berhenti dengan `{"code":"WorkspaceOutside","message":"path outside the workspace: C:/Users/Zyrex/AppData/Local/Temp/zephyr-v18-...ts"}` — probe-nya menulis berkas ke folder temp OS, dan penjaga workspace aplikasi menolaknya. Berkas itu tidak punya satu pun referensi `keybindings` (`grep -c keybindings scripts/verify18.mjs` = 0), jadi ini masalah harness/penjaga-path, bukan chord kembar. `verify18` bukan milik lane ini (READ-ONLY), jadi tidak diperbaiki — dilaporkan saja.

## 7. Berkas

| Berkas | Status |
|---|---|
| `src/lib/keybindings.ts` | **DIUBAH** (+295/−39): `chordAlias`, `gabungChordKembar`, `tabelEfektif`, `entriChord`, `cariPintasan`, `resolveChord`, `chordConflicts` dari tabel kanonik |
| `scripts/uji-keymap-chord-gabung.mjs` | **BARU** (harness, 17 kasus) |
| `docs/LAPORAN-TEMUAN-EKSTENSI-B.md` | **BARU** (laporan ini) |

Tidak ada berkas lain yang disentuh; `scripts/uji-keymap-live.mjs`, `uji-ikon-bersih.mjs`, `uji-katalog-ekstensi-jujur.mjs`, `uji-halaman-tema.mjs`, `docs/IKON-KETINGGALAN-12.md`, dan `docs/KATALOG-EKSTENSI-JUJUR.md` tidak diubah.
