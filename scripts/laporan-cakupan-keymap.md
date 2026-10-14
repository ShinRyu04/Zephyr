# Laporan cakupan keymap — paket keymap ter-embed Zephyr

Tanggal: 2026-10-14 · Cabang: `feat/ai-panel-vscode-layout` · Sumber: `scripts/uji-keymap-live.mjs`

Jalankan ulang:

```bash
cd D:/Zephyr && node scripts/uji-keymap-live.mjs; echo "EXIT=$?"
```

Arti kode keluar: **0** = setiap chord di 4 paket menunjuk perintah Zephyr yang benar-benar ada;
**1** = ada chord yang menunjuk perintah tidak dikenal (daftarnya dicetak, lengkap dengan tebakan padanan terdekat).

---

## 1. Ringkasan (angka nyata dari satu kali jalan)

| Ukuran | Nilai |
|---|---|
| Paket keymap | **4** (Vim, Emacs, JetBrains, Sublime) |
| Chord total | **37** |
| Chord punya padanan perintah nyata | **37 (100%)** |
| Chord tanpa padanan | **0** |
| Perintah tak dikenal (kelas bug lama) | **0** → skrip `exit 0` |
| Chord benar-benar MENDARAT di `mergeBindings` per paket | **8/10, 11/12, 10/10, 5/5 = 34/37** |
| Chord mati (paket memasangnya, Zephyr membuangnya) | **3** |
| Chord menimpa pintasan default | **2** |
| Pintasan default yang hilang saat paket dipasang | 6 / 6 / 6 / 3 per paket; **18** untuk gabungan semua paket |

Kesimpulan satu baris: **paket keymap benar-benar mengubah pintasan** (34 dari 37 chord mengubah
peta chord→perintah di resolver asli), **tapi 3 chord di antaranya terpasang tanpa efek** — dan itu
bukan salah nama perintah (kelas bug lama sudah bersih), melainkan aturan "satu baris per perintah"
di `mergeBindings`.

---

## 2. Cara buktinya (dua lapis)

**Lapis statis** — parse 4 paket langsung dari raw string Rust `r##"..."##` di
`src-tauri/src/ext_bundled_extra.rs` (Vim, Emacs, JetBrains) dan `src-tauri/src/ext_bundled.rs`
(Sublime); kumpulkan perintah nyata dari tiga sumber runtime (`commandRegistry.ts` 179 id,
`keybindings.ts` 81 id default non-stub, `shortcuts.ts` 34 aksi → union **203**); terapkan tabel
alias VS Code→Zephyr (`keymapAlias.ts`, 16 entri).

**Lapis hidup (bukan simulasi)** — `scripts/uji-keymap-live.mjs` menulis satu berkas entry sementara
ke `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/`, membundelnya dengan esbuild
(`node_modules/esbuild/bin/esbuild --bundle --platform=node --format=esm`) lalu **mengimpor modul
Zephyr yang asli** dan memanggil fungsi produksi:

- `mergeBindings(user, ext)` — fungsi `src/lib/keybindings.ts` yang dipakai aplikasi saat memasang paket,
- `perintahKeymap` asli dari `keymapAlias.ts` (jadi target chord dihitung oleh fungsi yang sama yang dipakai produksi, bukan tabel hasil parse),
- `normalizeChord` asli untuk menormalkan chord,
- `bindingMap({})` dari `shortcuts.ts` (peta lapisan panel Settings) untuk deteksi dua-lapis.

Dua jebakan yang harus dilewati supaya bundel bisa diimpor di Node, keduanya sudah ditangani di skrip:

1. `@xterm/addon-fit` membaca `self` di top-level → `--banner:js=if (typeof globalThis.self === "undefined") globalThis.self = globalThis;` (`--define:globalThis.self=...` **tidak cukup**: kode membaca `self` telanjang, bukan `globalThis.self`).
2. Kode app membaca `import.meta.env.DEV` (Vite) → `--define:import.meta.env={"DEV":false,"PROD":true,"MODE":"production"}` (tanpa ini impor gagal `TypeError`).

Nilai yang terbaca dari bundel membuktikan rantai impor benar-benar hidup, bukan stub:
`COMMAND_IDS = 219`, `DEFAULT_BINDINGS = 92` entri → **90 chord unik** sebelum paket apa pun,
`ACTIONS = 34` aksi → 32 chord di panel Settings.

Metodenya "sebelum vs sesudah": `mergeBindings([], [])` (baseline) dibandingkan dengan
`mergeBindings([], chordsPaket)` per paket, lalu dibandingkan lagi untuk gabungan semua paket.

---

## 3. Tabel per paket

`padanan` = chord yang perintahnya ada di Zephyr (setelah alias). `mendarat` = chord yang benar-benar
dipegang perintah itu setelah `mergeBindings` (bukan cuma "ada padanan").

| Paket | id | Chord | Punya padanan | Tanpa padanan | Mendarat (live) | Menimpa default | Default hilang |
|---|---|---|---|---|---|---|---|
| Keymap ala Vim | `zephyr.keymap-vim` | 10 | 10 (100%) | 0 | **8/10** | 0 | 6 |
| Emacs-style keymap | `zephyr.keymap-emacs` | 12 | 12 (100%) | 0 | **11/12** | 1 | 6 |
| JetBrains-style keymap | `zephyr.keymap-ide` | 10 | 10 (100%) | 0 | **10/10** | 1 | 6 |
| Sublime-style Keymap | `zephyr.keymap-sublime` | 5 | 5 (100%) | 0 | **5/5** | 0 | 3 |
| **Total** | | **37** | **37 (100%)** | **0** | **34/37** | **2** | — |
| Gabungan semua paket sekaligus | | 37 | 37 | 0 | 26/37 (11 rebutan perintah antar paket) | 2 | **18** |

### Contoh 5 chord yang berubah (per paket, dari output live)

**Vim** (babak `mendarat 8/10`, `menimpa default 0`)

| Chord | Efek | Jadi |
|---|---|---|
| `Ctrl+W Ctrl+Q` | baru | `file.closeTab` |
| `Ctrl+W Ctrl+K` | baru | `terminalPanel.focus` |
| `Ctrl+W Ctrl+J` | baru | `workbench.action.togglePanel` |
| `Ctrl+W` | default hilang | dulu `file.closeTab` (dipakai sebagai awalan chord `Ctrl+W …`) |
| `Ctrl+W Ctrl+W` | **mati** | kalah oleh `Ctrl+W Ctrl+L` (perintah sama: `view.nextTab`) |

**Emacs** (`11/12`, `1 timpa`)

| Chord | Efek | Jadi |
|---|---|---|
| `Ctrl+X Ctrl+F` | baru | `view.quickOpen` |
| `Ctrl+X Ctrl+B` | baru | `view.sidebar` |
| `Ctrl+X Ctrl+K` | baru | `editor.closeAll` |
| `Ctrl+S` | **timpa** | `file.save` → `edit.find` |
| `Ctrl+X 2` | **mati** | kalah oleh `Ctrl+X 3` (perintah sama: `view.splitEditorRight`) |

**JetBrains** (`10/10`, `1 timpa`)

| Chord | Efek | Jadi |
|---|---|---|
| `Alt+1` | baru | `view.sidebar` |
| `Alt+Insert` | baru | `file.new` |
| `Ctrl+Alt+L` | baru | `editor.formatDocument` |
| `Ctrl+E` | baru | `view.nextTab` (alias `quickOpenRecent` → `view.nextTab`; Zephyr tidak punya perintah "recent") |
| `Ctrl+Shift+A` | **timpa** | `ai.panel` → `view.palette` |

**Sublime** (`5/5`, `0 timpa`)

| Chord | Efek | Jadi |
|---|---|---|
| `Ctrl+Shift+Up` | baru | `editor.line.moveUp` |
| `Ctrl+Shift+Down` | baru | `editor.line.moveDown` |
| `Ctrl+K Ctrl+B` | baru | `view.sidebar` |
| `Ctrl+Shift+K` | baru | `editor.line.delete` |
| `Ctrl+Shift+L` | baru | `editor.select.occurrences` |

### Daftar chord tanpa padanan per paket

Tidak ada di keempat paket:

```
=== PERINTAH DIPAKAI PAKET TAPI TANPA PADANAN DI ZEPHYR ===
(tidak ada)
```

Itu kabar baik sekaligus hasil uji regresi: kelas bug lama
(`editor.copyLineDown`, `editor.moveLineUp`, `editor.moveLineDown`, `editor.splitRight`) sudah
bersih; sekarang semuanya memakai id nyata (`editor.line.moveUp`, `editor.line.moveDown`,
`view.splitEditorRight`).

---

## 4. Temuan

### T1 — P0: 3 chord terpasang tapi MATI (kelas "terpasang tanpa efek")

Bukti live (`perintah ini akhirnya di chord: …`):

```
Vim      DITOLAK: Ctrl+W Ctrl+W -> "view.nextTab"          (pemegang sekarang: kosong - chord mati; perintah ini kini di chord: Ctrl+W Ctrl+L)
Vim      DITOLAK: Ctrl+W Ctrl+V -> "view.splitEditorRight" (pemegang sekarang: kosong - chord mati; perintah ini kini di chord: Ctrl+W |)
Emacs    DITOLAK: Ctrl+X 2      -> "view.splitEditorRight" (pemegang sekarang: kosong - chord mati; perintah ini kini di chord: Ctrl+X 3)
```

Penyebab (bukan nama perintah yang salah — ketiga perintahnya ada di registry):

- `src/lib/keybindings.ts:236-239` — `const idx = out.findIndex((b) => b.command === cmd); if (idx >= 0) out[idx] = { ...out[idx], chord, source }`. Jadi **satu perintah hanya boleh punya satu baris/chord**; entri paket berikutnya untuk perintah yang sama **mengganti** chord baris itu, tidak menambah baris.
- `src-tauri/src/ext_bundled_extra.rs` memasang satu perintah dua kali: `view.nextTab` di baris 137 (`Ctrl+W Ctrl+W`) dan 142 (`Ctrl+W Ctrl+L`); `workbench.action.splitEditorRight` di 138 (`Ctrl+W Ctrl+V`) dan 145 (`Ctrl+W |`); `view.splitEditorRight` di 172 (`Ctrl+X 2`) dan 173 (`Ctrl+X 3`, lewat alias). Yang belakangan menang, yang duluan hilang tanpa peringatan.

Artinya manifes paket "menjanjikan" 10/12 chord, tapi pengguna hanya mendapat 8/11 — persis gejala
"terpasang tanpa efek" yang ingin dibuktikan.

Model runtime Zephyr sendiri mendukung banyak chord per perintah (`resolveBinding` di
`keybindings.ts:304-315` melakukan `bindings.filter((b) => b.chord === sequence)`), jadi pembatasnya
murni aturan merge itu.

### T2 — P1: paket Emacs merebut `Ctrl+S` (save) dan lapisan panel tidak ikut berubah

`Ctrl+S` default = `file.save`; paket Emacs memasang `Ctrl+S → workbench.action.terminal.focusFind`
(alias `edit.find`) dan menang di resolver app. Tapi `bindingMap({})` (lapisan panel Settings di
`shortcuts.ts`) **masih** memetakan `Ctrl+S → file.save` → dua lapisan berbeda pendapat soal satu
tombol (`panel Settings masih pegang chord ini utk "file.save"`). Kalau kedua jalur benar-benar
menangkap keydown di runtime, satu tekan bisa memicu dua aksi.

Efek nyata bagi pengguna: memasang paket Emacs membuat `Ctrl+S` tidak lagi menyimpan.

### T3 — P1: paket JetBrains merebut `Ctrl+Shift+A` (panel AI)

`Ctrl+Shift+A` default = `ai.panel`; paket JetBrains memasang `view.palette`, dan lapisan panel masih
memegang `ai.panel`. Sama seperti T2: paket ini secara desain menimpa pintasan panel AI dan
mengorbankan `Ctrl+Shift+P` (palette default, baris `default hilang`).

### T4 — P2: urutan entri di dalam paket menentukan pemenang (jebakan penulis paket)

`Ctrl+W |` (baris 145) dan `Ctrl+W -` (baris 146) memakai tombol karakter telanjang sebagai langkah
kedua; `|` bergantung layout (Shift+`\`). Karena ia diletakkan SETELAH `Ctrl+W Ctrl+V` (138), ia
mematikan chord yang lebih idiomatis. Penulis paket tidak punya cara mengetahui ini kecuali menjalankan
alat ini.

### T5 — P2: alias "identitas"

`workbench.action.togglePanel` → `workbench.action.togglePanel` (`keymapAlias.ts:23`) tidak mengubah
apa pun; baris ini hanya menandai id Zephyr yang menyerupai id VS Code. Tidak berbahaya, tapi
membuat hitungan "dialihkan" sedikit menyesatkan.

---

## 5. Rekomendasi konkret

Prioritas tinggi:

1. **Perbaiki `mergeBindings` (`src/lib/keybindings.ts:236-239`)** supaya entri paket dengan perintah yang sudah punya baris **menambah baris baru** alih-alih mengganti chord baris lama (mis. ganti chord hanya kalau `chord` hasil normalisasi identik). Ini langsung menghidupkan kembali `Ctrl+W Ctrl+W`, `Ctrl+W Ctrl+V`, dan `Ctrl+X 2` tanpa menyentuh paket. Konsekuensi yang perlu dicek: `chordFor()` (`keybindings.ts:291-293`) mengembalikan chord pertama, jadi UI Settings hanya akan menampilkan satu chord per perintah, dan `chordConflicts`/`prefixSet` perlu diuji ulang.
2. **Kalau merge tidak diubah**, buang entri yang pasti kalah supaya manifes tidak berbohong:
   - `ext_bundled_extra.rs:142` (`Ctrl+W Ctrl+L`) **atau** `:137` (`Ctrl+W Ctrl+W`) — pilih satu untuk `view.nextTab`;
   - `ext_bundled_extra.rs:145` (`Ctrl+W |`) — buang, pertahankan `:138` `Ctrl+W Ctrl+V`;
   - `ext_bundled_extra.rs:172` (`Ctrl+X 2`) **atau** `:173` (`Ctrl+X 3`) — pilih satu untuk `view.splitEditorRight` (Zephyr tidak punya perintah split-bawah, jadi tidak ada target berbeda yang bisa dipakai untuk menyelamatkan keduanya).

Prioritas menengah:

3. **Emacs `Ctrl+S`**: buang `ext_bundled_extra.rs:171` (`Ctrl+S → workbench.action.terminal.focusFind`) atau pindahkan ke `Ctrl+X Ctrl+F`-style chord; mengorbankan save dengan Ctrl+S terlalu mahal. Kalau tetap dipertahankan, sebutkan di deskripsi paket.
4. **JetBrains `Ctrl+Shift+A`**: sadari/nyatakan bahwa paket ini mematikan `ai.panel` dan `Ctrl+Shift+P`. Kalau tidak diinginkan, ganti chord paket ke `Ctrl+Alt+Shift+A`.

Prioritas rendah:

5. Paket Vim mengganti `Ctrl+\`` (terminal) dan `Ctrl+Tab`/`Ctrl+Shift+Tab` (tab) dengan chord `Ctrl+W …`. Wajar untuk paket Vim, tapi layak dicatat di deskripsi paket.
6. Rapikan alias identitas `workbench.action.togglePanel` (T5) — kosmetik.

---

## 6. Usulan kalimat UI

Untuk halaman detail paket keymap (angka dari keluaran nyata; bentuk paling jujur menyebut dua angka:
yang tidak punya padanan **dan** yang tidak aktif):

> **Paket Vim**: dari 10 pintasan, 0 belum punya padanan di Zephyr, tetapi 2 tidak aktif karena perintahnya sudah dipegang chord lain (`Ctrl+W Ctrl+W`, `Ctrl+W Ctrl+V`).

> **Paket Emacs**: dari 12 pintasan, 0 belum punya padanan di Zephyr, tetapi 1 tidak aktif (`Ctrl+X 2`). Perhatian: paket ini menggantikan `Ctrl+S` (Simpan) menjadi Pencarian.
>
> **Paket JetBrains**: dari 10 pintasan, 0 belum punya padanan di Zephyr. Perhatian: `Ctrl+Shift+A` berhenti membuka panel AI dan menjadi Palet Perintah.
>
> **Paket Sublime**: dari 5 pintasan, semua sudah punya padanan dan aktif di Zephyr.

Kalimat ringkas versi tugas — "dari N pintasan, M belum punya padanan di Zephyr" — dengan angka
sekarang berbunyi: **"dari 37 pintasan, 0 belum punya padanan di Zephyr"**. Karena M = 0, kalimat itu
saja akan menyesatkan (terkesan 37 pintasan semuanya bekerja, padahal 3 mati); tambahkan klausa
kedua: **"3 di antaranya tidak aktif karena perintahnya sudah dipegang chord lain."** Untuk kasus M > 0
(regresi di masa depan) gunakan template apa adanya, plus daftar chord + tebakan padanan terdekat
yang sudah dicetak skrip, mis. `workbench.action.files.save -> file.save`.

---

## 7. Yang BELUM terbukti (jujur) + cara membuktikannya nanti

| # | Belum terbukti | Kenapa | Cara membuktikan nanti |
|---|---|---|---|
| 1 | Efek pada keydown nyata (tekan tombol → perintah benar-benar jalan) | Aplikasi tidak dijalankan dan CDP `:9223` dilarang di lane ini; yang dibuktikan adalah peta binding yang dihasilkan fungsi produksi, bukan jalur event DOM→handler | Jalankan app, pasang paket, tekan `Ctrl+W Ctrl+L`, `Ctrl+W Ctrl+W`, `Ctrl+S`, `Ctrl+X 2`; atau pakai harness CDP lama (salinan ada di `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/uji-keymap-live.cdp-backup.mjs`) |
| 2 | Jalur Rust→JS (Tauri mengembalikan string katalog → `extLoader.muatKeymap` → `extKeymap` → `commandsEkstensi`) | Skrip mem-parse raw string Rust langsung dan memberi `mergeBindings` daftar chord berbentuk `{key, command, source}` (bentuk yang sama dihasilkan `muatKeymap`), jadi perantaranya ditiru, bukan dipanggil | Di webview: panggil `keymapEkstensi()` / `commandsEkstensi()` setelah paket dimuat, bandingkan dengan 37 chord di sini; atau unit test Rust yang memastikan `KEYMAP_*_JSON` valid JSON |
| 3 | Apakah T2/T3 benar-benar memicu dua aksi pada satu keypress | Butuh runtime: dua lapisan (`keybindings.ts` app layer vs `shortcuts.ts` panel layer) sama-sama melihat keydown | Uji manual dengan penghitung pemanggilan perintah, atau instrumentasi sementara di handler key |
| 4 | Perilaku chord `Ctrl+W |` pada layout keyboard non-US | `|` = Shift+`\`; skrip hanya menormalkan string, tidak tahu layout | Uji manual di layout US-Intl/ID |
| 5 | Jalur kode yang hanya aktif saat DEV (`import.meta.env.DEV`) | Bundel dijalankan dengan `import.meta.env` dipalsukan ke produksi | Jalankan app mode dev dan ulangi lewat CDP |
| 6 | `--define:globalThis.self` vs banner: skrip memakai banner | Tidak diklaim sebagai jalan yang sama dengan app | Tidak perlu — hanya detail teknis bundel |

Catatan proses: berkas `scripts/uji-keymap-live.mjs` sebelumnya berisi harness uji live CDP (port
9223) yang belum ter-commit; karena lane ini minta nama berkas yang sama untuk analyzer ini, isi lama
digantikan dan salinannya disimpan di
`C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/uji-keymap-live.cdp-backup.mjs`. Tidak ada berkas
`src/**` atau `src-tauri/**` yang diubah.

---

## 8. Reproduksi (bukti mentah)

```
$ node scripts/uji-keymap-live.mjs; echo "EXIT=$?"
=== UJI KEYMAP ZEPHYR (statis) ===
repo     : D:\Zephyr
paket    : 4  chord total 37
id Zephyr: registry 179 v keybindings 81 (non-stub) v shortcuts 34 => union 203
alias VS Code->Zephyr: 16 entri; alias "identitas" (tidak mengubah apa pun): 1 [workbench.action.togglePanel]

--- Keymap ala Vim [Vim]
    id     : zephyr.keymap-vim
    berkas : src-tauri/src/ext_bundled_extra.rs  (manifes KEYMAP_VIM / chord KEYMAP_VIM_JSON / keymaps/vim.json)
    chord  : 10  punya padanan: 10 (100.0%)
    dialihkan alias: 3 contoh: Ctrl+W Ctrl+V workbench.action.splitEditorRight->view.splitEditorRight; Ctrl+W Ctrl+Q workbench.action.closeActiveEditor->file.closeTab; Ctrl+W | workbench.action.splitEditorRight->view.splitEditorRight
    chord bentrok dgn default: 0
    contoh chord (maks 5): Ctrl+W Ctrl+W=>view.nextTab, Ctrl+W Ctrl+V=>view.splitEditorRight, Ctrl+W Ctrl+S=>view.joinEditorGroups, Ctrl+W Ctrl+Q=>file.closeTab, Ctrl+W Ctrl+H=>view.prevTab
    LIVE mergeBindings  : mendarat 8/10, chord baru 8, menimpa default 0, DITOLAK 2
      DITOLAK         : Ctrl+W Ctrl+W -> "view.nextTab" (pemegang sekarang: (kosong - chord mati); perintah ini kini di chord: Ctrl+W Ctrl+L)
      DITOLAK         : Ctrl+W Ctrl+V -> "view.splitEditorRight" (pemegang sekarang: (kosong - chord mati); perintah ini kini di chord: Ctrl+W |)
      default hilang  : Ctrl+W (file.closeTab)
      default hilang  : Ctrl+J (workbench.action.togglePanel)
      default hilang  : Ctrl+` (terminalPanel.focus)
      default hilang  : Ctrl+\ (view.splitEditorRight)
      default hilang  : Ctrl+Tab (view.nextTab)
      default hilang  : Ctrl+Shift+Tab (view.prevTab)

--- Emacs-style keymap [Emacs]
    ...
    LIVE mergeBindings  : mendarat 11/12, chord baru 9, menimpa default 1, DITOLAK 1
      menimpa default : Ctrl+S (Ctrl+S) "file.save" -> "edit.find"
      DITOLAK         : Ctrl+X 2 -> "view.splitEditorRight" (pemegang sekarang: (kosong - chord mati); perintah ini kini di chord: Ctrl+X 3)
      ...
      panel Settings masih pegang chord ini utk "file.save"

--- JetBrains-style keymap [JetBrains]
    LIVE mergeBindings  : mendarat 10/10, chord baru 7, menimpa default 1, DITOLAK 0
      menimpa default : Ctrl+Shift+A (Ctrl+Shift+A) "ai.panel" -> "view.palette"
      panel Settings masih pegang chord ini utk "ai.panel"

--- Sublime-style Keymap [Sublime]
    LIVE mergeBindings  : mendarat 5/5, chord baru 3, menimpa default 0, DITOLAK 0

=== BUKTI EFEK NYATA (resolver asli: mergeBindings + bindingMap, dibundel esbuild) ===
COMMAND_IDS di runtime : 219 (registry + default non-stub, hasil impor modul asli)
DEFAULT_BINDINGS       : 92 entri -> 90 chord unik sebelum paket apa pun
ACTIONS (panel Setting): 34 aksi -> 32 chord di panel

  GABUNGAN SEMUA PAKET
    mendarat 26/37 | chord baru 19 | menimpa default 2 | ditolak 11 | default hilang 18
  chord antar-paket: tidak ada tabrakan antar paket

HASIL: LULUS (chord tanpa padanan perintah: 0)
EXIT=0
```

(Keluaran penuh 136 baris; versi utuh disimpan di
`C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/out-final.txt`.)
