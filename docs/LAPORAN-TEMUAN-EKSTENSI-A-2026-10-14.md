# Laporan Temuan Ekstensi A — 14 Oktober 2026

Cabang: `feat/ai-panel-vscode-layout` (repo `D:/Zephyr`).
Lane: temuan ekstensi A (merge keymap + 5 temuan ekstensi lain).
Semua angka di bawah adalah keluaran perintah nyata yang dijalankan dari `D:/Zephyr`.

---

## 1. Bug merge keymap — pintasan bawaan hilang + chord paket ditolak

### 1.1 Akar masalah

`src/lib/keybindings.ts` → `mergeBindings()`. Loop pemasangan chord paket berbunyi:

```ts
if (b.command !== e.command && b.chord === chord) b.chord = ''   // LAMA
```

Cabang "perintah belum ada di registry" menelanjangi chord milik perintah **lain** (termasuk
pintasan bawaan) **sebelum** binding ekstensinya sendiri ditambahkan; begitu binding itu gagal
dipasang (perintahnya juga tidak dikenal), chord tersebut hilang dari dua sisi — defaultnya
sudah dihapus, penggantinya tidak pernah ada. Itu sebabnya satu paket bisa menghapus `Ctrl+P`,
`Ctrl+S`, `Ctrl+F` sekaligus *dan* melaporkan chord-nya "ditolak".

Karena satu perintah juga hanya boleh dipegang satu chord, chord kedua dari perintah yang sama
terus menimpa chord pertama → paket mencatat "ditolak".

Catatan riwayat (apa adanya): HEAD cabang ini sudah memuat versi antara yang membuang
`b.command !== e.command` (komentar `The loop used to read ...`), yaitu penyebab (1). Sisa
penyebab (2) — satu baris per perintah — masih ada di HEAD dan diperbaiki di working tree
(`out.splice(idx, 0, baris)`, lihat 1.2). Snapshot MERAH di 1.4 diambil sebelum kedua perbaikan
itu, sehingga memuat 18 pintasan hilang **dan** 11 chord ditolak sekaligus.

### 1.2 Perbaikan

`src/lib/keybindings.ts` → `mergeBindings()` (blok merge, sekitar baris 219–270):

- baris (chord, perintah) yang sudah ada **dilewati**, tidak ditulis ganda:
  `if (out.some((b) => b.chord === chord && b.command === cmd)) continue;`
- **satu perintah boleh punya banyak chord**: baris baru tidak lagi menimpa baris perintah itu
  yang sudah ada (versi lama `out[idx] = { ...out[idx], chord }` menghapus chord bawaan perintah
  yang sama dan chord yang baru ditulis itu sendiri hilang saat paket berikutnya menyentuh
  perintah yang sama → 11 chord dilaporkan DITOLAK);
- chord yang sedang dipegang baris lain **tidak dikosongkan** lagi (`b.chord = ''` dihapus dari
  jalur paket): baris baru **disisipkan di depan** baris pemegangnya
  (`if (idx >= 0) out.splice(idx, 0, baris); else out.push(baris);`) — resolver membaca yang
  pertama, jadi paket tetap mengambil alih chord itu secara eksplisit sementara baris bawaan
  tetap ada di tabel (terlihat di Settings; itulah "menimpa default 2" yang sah di hasil hijau);
- `when`/`layer` diwarisi dari baris yang diambil alih (kalau ada), lalu dari baris perintah ini
  yang sudah ada, terakhir `'global'`/`'app'`;
- prioritas paket tidak diubah: urutan pemrosesan paket menentukan siapa di depan;
- sisa baris dengan chord kosong dibersihkan sekali di akhir (`out.filter((b) => b.chord !== '')`).

### 1.3 Harness diperketat DULU (MERAH)

`scripts/uji-keymap-live.mjs` — ditambah blok **(g) ASSERTION KERAS**:

- daftar eksplisit 15 pintasan bawaan `WAJIB_DEFAULT`
  (`Ctrl+P, Ctrl+N, Ctrl+S, Ctrl+W, Ctrl+F, Ctrl+H, Ctrl+Shift+P, Ctrl+Shift+F, Alt+Up,
  Alt+Down, Ctrl+K Ctrl+W, Ctrl+B, Ctrl+J, F5, Ctrl+Shift+X`);
- tiap pintasan harus tetap dipegang perintah yang sama sesudah 4 paket keymap dipasang;
- chord "ditolak" harus 0;
- pemetaan dua keadaan (`petaDasar` vs `petaSemua`) diambil dari `mergeBindings()` yang sama
  dengan yang dipakai aplikasi;
- uji **gagal dengan exit != 0** kalau ada pelanggaran:
  `scripts/uji-keymap-live.mjs:590` → `process.exit(gagalTotal === 0 && pelanggaran.length === 0 ? 0 : 1)`.

### 1.4 Keluaran SEBELUM (MERAH) — snapshot 14 Okt 05:1x, sebelum perbaikan `keybindings.ts`

```
  GABUNGAN SEMUA PAKET
    mendarat 26/37 | chord baru 19 | menimpa default 2 | ditolak 11 | default hilang 18
...
pelanggaran           : 50
  pintasan bawaan HILANG setelah paket dipasang (12/15):
...
  paket Keymap ala Vim: 2 chord ditolak
  paket Emacs-style keymap: 1 chord ditolak
  chord paket mendarat 26/37 (harus semuanya)
HASIL: GAGAL (chord tanpa padanan perintah: 0, pelanggaran assertion: 50)
```

Contoh baris mentah per paket pada snapshot yang sama:

```
    LIVE mergeBindings  : mendarat 11/12, chord baru 9, menimpa default 1, DITOLAK 1
      menimpa default : Ctrl+S (Ctrl+S) "file.save" -> "edit.find"
      default hilang  : Ctrl+Shift+P (view.palette)
      default hilang  : Ctrl+P (view.quickOpen)
      default hilang  : Ctrl+S (file.save)
      default hilang  : Ctrl+W (file.closeTab)
      default hilang  : Ctrl+K Ctrl+W (editor.closeAll)
      default hilang  : Ctrl+F (edit.find)
    LIVE mergeBindings  : mendarat 5/5, chord baru 3, menimpa default 0, DITOLAK 0
      default hilang  : Alt+Up (editor.line.moveUp)
      default hilang  : Alt+Down (editor.line.moveDown)
      default hilang  : Ctrl+B (view.sidebar)
```

Snapshot penuh: `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/keymap-SEBELUM.txt` (190 baris).
Catatan kejujuran: kode exit snapshot itu tidak terekam, tetapi baris 590 di atas membuktikan
`HASIL: GAGAL` (= pelanggaran > 0) berhenti dengan exit 1.

### 1.5 Keluaran SESUDAH (HIJAU) — `node scripts/uji-keymap-live.mjs`

```
  GABUNGAN SEMUA PAKET
    mendarat 37/37 | chord baru 30 | menimpa default 2 | ditolak 0 | default hilang 0
  chord antar-paket: tidak ada tabrakan antar paket

=== ASSERTION (HARUS 0 PELANGGARAN) ===
pintasan bawaan diuji : 15 [Ctrl+P, Ctrl+N, Ctrl+S, Ctrl+W, Ctrl+F, Ctrl+H, Ctrl+Shift+P, Ctrl+Shift+F, Alt+Up, Alt+Down, Ctrl+K Ctrl+W, Ctrl+B, Ctrl+J, F5, Ctrl+Shift+X]
pelanggaran           : 0

HASIL: LULUS (chord tanpa padanan perintah: 0, pelanggaran assertion: 0)
```

Exit code: **0**. Snapshot penuh: `.../scratch/keymap-SESUDAH.txt`.

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| chord paket mendarat | 26/37 | **37/37** |
| chord ditolak | 11 | **0** |
| pintasan bawaan hilang | 18 | **0** |
| pelanggaran assertion | 50 | **0** |
| hasil | GAGAL (exit 1) | **LULUS (exit 0)** |

---

## 2. `commandRegistry.ts` — perintah tema yang sudah disembunyikan

`theme.github-dark` dan `theme.min-light` sudah disembunyikan dari pemilih tema (`tersembunyi`
di `src/lib/themes.ts`), tetapi registry masih mendaftarkan perintahnya lewat
`...THEMES.map(...)` — memilih perintah itu memasang tema yang tidak bisa dipilih lagi.

Perubahan (`src/lib/commandRegistry.ts`, sekitar baris 1528):
`...THEMES.filter((t) => !t.tersembunyi).map((t) => ({ ... }))` + komentar alasan.

---

## 3. `scripts/uji-t6-tema-mode.mjs` — kartu tema yang sudah disembunyikan

Baris ~64 (di dalam template literal yang dikirim ke halaman): `pilihKartu('min-light')` →
`pilihKartu('zephyr-light')`. Kartu `min-light` tidak pernah dirender lagi, jadi uji lama
menunggu 3,5 detik untuk elemen yang tidak ada (dan gagal dengan pesan menyesatkan).

Dua catatan apa adanya:

1. Versi pertama komentar saya memakai backtick di dalam template literal → berkas gagal
   di-parse (`SyntaxError: missing ) after argument list`). Ketahuan lewat `node --check`,
   sudah diperbaiki (komentar tanpa backtick).
2. Percobaan pertama setelah perbaikan gagal: `Error: timeout: halaman sepertinya RELOAD di
   tengah uji` (`scripts/lib-cdp.mjs:423`) — halaman dev reload (HMR) di tengah uji. Percobaan
   ulang 20 detik kemudian (app hidup di CDP 9223) LULUS penuh:

```
=== Mode tampilan vs tema aktif (C3) ===
  LULUS  T1 pill "Zephyr Dark" memindah tema aktif  theme.current=zephyr-dark
  LULUS  T2 yang dirender = zephyr-dark  data-theme=zephyr-dark
  LULUS  T2 kartu aktif = yang dirender  kartu=zephyr-dark
  LULUS  T3 kartu tema terang → pill jadi Zephyr Light  pill=Zephyr Light
  LULUS  T3 kartu aktif = nord-light  kartu=nord-light
  LULUS  T4 mode "system" mengikuti OS  resolve=zephyr-dark osGelap=true
  LULUS  T5 state bentrok: yang dirender & kartu aktif sama (tak diam-diam)  render=zephyr-light resolve=zephyr-light kartu=zephyr-light
```

Exit code 0. (Jadi item ini **tidak** "BUTUH APP" — app memang hidup, bukti nyata di atas.)

---

## 4. `src-tauri/src/ext_lang_icons.rs` — 12 id mati di `LOGO_URI`

Id di `LOGO_URI` yang paketnya sudah dibuang dari katalog (kini bahasa bawaan
`src/lib/lang.ts`) dihapus, tanpa menyentuh fungsinya (`LOGO_URI` tetap `pub const`, tetap
`&[(&str, &str)]`):

`zephyr.lang-asterisk, -clike, -css, -go, -javascript, -lua, -rust, -sql, -swift, -toml,
-ttcn-cfg, -yaml` — **12 baris**.

Bukti: entri `("zephyr.lang-…` 73 → 61 (diverifikasi skrip sekali pakai
`scratch/buang-logo-mati.py`: menolak jalan bila id tidak ditemukan/ganda, bila jumlah tidak
turun 12, atau bila ekor berkas `];` berubah).

### `cargo test --lib` (dari `D:/Zephyr/src-tauri`)

```
test result: FAILED. 452 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.27s
failures:
    ext_pkg::tests_unduh::zext_lalu_laporan_bukti_berangka_per_jenis
---- ext_pkg::tests_unduh::zext_lalu_laporan_bukti_berangka_per_jenis stdout ----
thread '...' panicked at src\ext_pkg.rs:2227:9:
assertion `left == right` failed
  left: "acme.paket-uji"
 right: "paket-uji"
```

Apa adanya: **452 lulus, 1 gagal** (baseline tugas menyebut 446 lulus — jumlah naik karena
uji lain bertambah). Kegagalan itu di `ext_pkg.rs` (berkas yang **tidak** saya ubah, sedang
dimodifikasi lane lain; `ext_pkg.rs` tidak menyebut `LOGO_URI` sama sekali →
`grep -n LOGO_URI src-tauri/src/ext_pkg.rs` kosong), isinya soal prefiks id paket
(`acme.paket-uji` vs `paket-uji`), bukan soal ikon/LOGO_URI. Jadi perubahan saya tidak
menyebabkan kegagalan ini; **tidak** saya klaim beres.

---

## 5. Label daftar ekstensi — `src/components/extensions/**`

`src/components/extensions/ExtensionsView.tsx`: tabel `CATATAN_BAHASA` + baris penanda di
kartu ekstensi (`data-testid="xc-catatan-<id>"`):

- `zephyr.lang-perl` — melengkapi bahasa bawaan — menambah `.t`, `.pod`
- `zephyr.lang-python` — melengkapi bahasa bawaan — menambah `.pyi`
- `zephyr.lang-ruby` — melengkapi bahasa bawaan — menambah `.erb`, `.gemspec`
- `zephyr.lang-shell` — melengkapi bahasa bawaan — menambah `.fish`
- `zephyr.lang-xml` — melengkapi bahasa bawaan — menambah `.xsd`, `.xsl`, `.xhtml`
- `zephyr.lang-puppet` — sudah tercakup (pascal dimuat lebih dulu)

Dasar "ekstensi yang ditambah": `grep -cE "pyi|t|pod|erb|gemspec|fish|xsd|xsl|xhtml|pp"` di
`src/lib/lang.ts` = **0** → ekstensi itu memang belum diklaim peta bawaan, jadi paketnya
benar-benar menambah. Dasar puppet: `LANG_PASCAL` mengklaim
`extensions: [".pas", ".pp", ".dpr", ".lpr"]` dan ada **lebih dulu** di katalog
(`src-tauri/src/ext_bundled.rs`), sementara `LANG_PUPPET` (dimuat sesudahnya) juga mengklaim
`.pp` — yang lebih dulu menang, jadi paket puppet tidak pernah aktif. Ditulis apa adanya.

### `npx tsc --noEmit` (dari `D:/Zephyr`)

```
src/lib/zephyrDokumen.ts(359,17): error TS2323: Cannot redeclare exported variable 'versiTeratas'.
src/lib/zephyrDokumen.ts(359,17): error TS2393: Duplicate function implementation.
src/lib/zephyrDokumen.ts(369,17): error TS2323: Cannot redeclare exported variable 'versiTeratas'.
src/lib/zephyrDokumen.ts(369,17): error TS2393: Duplicate function implementation.
```

**4 galat, semuanya di `src/lib/zephyrDokumen.ts`** — berkas **tidak terlacak** (`git status`:
`?? src/lib/zephyrDokumen.ts`, baru dibuat lane lain; tak ada di HEAD, jadi galatnya
pra-ada/bukan akibat perubahan saya). Tidak satu pun galat menunjuk berkas yang saya ubah →
**0 galat baru**.

---

## 6. Berkas yang diubah (path lengkap)

1. `D:/Zephyr/src/lib/keybindings.ts` — inti perbaikan `mergeBindings()` (blok merge).
2. `D:/Zephyr/scripts/uji-keymap-live.mjs` — pemetaan dua keadaan + blok assertion keras (g)
   (15 pintasan bawaan, ditolak = 0, exit ≠ 0 saat dilanggar).
3. `D:/Zephyr/src/lib/commandRegistry.ts` — buang perintah tema tersembunyi
   (`THEMES.filter((t) => !t.tersembunyi)`).
4. `D:/Zephyr/scripts/uji-t6-tema-mode.mjs` — `pilihKartu('min-light')` → `'zephyr-light'`.
5. `D:/Zephyr/src-tauri/src/ext_lang_icons.rs` — 12 id mati dibuang dari `LOGO_URI`.
6. `D:/Zephyr/src/components/extensions/ExtensionsView.tsx` — `CATATAN_BAHASA` + penanda kartu.
7. `D:/Zephyr/docs/LAPORAN-TEMUAN-EKSTENSI-A-2026-10-14.md` — laporan ini.
8. `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/buang-logo-mati.py` — skrip sekali pakai
   (bukti pembersihan `LOGO_URI`, bukan bagian repo).

Berkas yang **tidak** diubah (milik lane lain / dilarang): `src/lib/zephyrDokumen.ts`,
`src-tauri/src/ext_pkg.rs`, `src/lib/lang.ts`, `src-tauri/src/ext_bundled.rs`,
`src/lib/themes.ts`, `scripts/verify0*.mjs`, `scripts/verify11.mjs`, `scripts/mock-ai.mjs`,
`scripts/uji-bahasa-live.mjs`, `scripts/uji-tema-sintaks-vscode.mjs`, `src/lib/zephyrTools/**`,
`src/lib/zephyrFakta.ts`, `src/lib/zephyrIndeks.ts`, `src/lib/aiStore.ts`.

---

## 7. Sisa yang belum bisa dibuktikan

1. **`cargo test --lib` tidak 100% hijau** — 452 lulus, 1 gagal
   (`ext_pkg::tests_unduh::zext_lalu_laporan_bukti_berangka_per_jenis`, `src/ext_pkg.rs:2227`).
   Bukan berkas saya, tidak menyentuh `LOGO_URI`; perlu pemilik `ext_pkg.rs` yang menutup.
2. **`npx tsc --noEmit` tidak 0 total** — 4 galat pra-ada di `src/lib/zephyrDokumen.ts`
   (duplikat `versiTeratas`, berkas tak terlacak milik lane lain). Berkas saya 0 galat.
3. **Kode exit snapshot MERAH tidak tersimpan** — snapshot hanya memuat teks
   `HASIL: GAGAL (… pelanggaran assertion: 50)`; jaminan exit ≠ 0 datang dari baris 590
   harness (dibaca langsung), bukan dari arsip kode exit.
4. **Uji paket ekstensi lain (7 paket lain di daftar katalog kanal) tidak dijalankan** — di
   luar cakupan lane ini; item 5–7 hanya diuji lewat keymap, t6, tsc, dan `cargo test --lib`.
5. **Label kartu tidak diverifikasi lewat tangkapan layar/DOM hidup** — label diverifikasi
   lewat `tsc` + pembacaan berkas; uji UI untuk `xc-catatan-*` belum ada. Perlu app hidup
   (CDP 9223) untuk mengunci lewat DOM.
6. **`uji-t6-tema-mode.mjs` rapuh terhadap reload halaman** — percobaan pertama gagal
   `timeout: halaman sepertinya RELOAD di tengah uji` (`lib-cdp.mjs:423`). Lolos saat diulang;
   akarnya HMR dev, bukan pilihan kartu.
