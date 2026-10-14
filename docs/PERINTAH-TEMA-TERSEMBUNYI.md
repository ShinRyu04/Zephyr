# Perintah tema untuk tema yang disembunyikan

**Item kanonik:** `zeph-perintah-tema-tersembunyi` (perintah `theme.github-dark` &
`theme.min-light`) + `zeph-uji-t6-tema-mode` (uji-t6 memanggil kartu `min-light`).
**Tanggal:** 2026-10-14 · **Cabang:** `feat/ai-panel-vscode-layout` · Lane: tema/perintah.

**Hasil singkat.** Perintah per tema sekarang dibuat dari `semuaTema()` — daftar yang
sama dengan yang dipakai pemilih tema. Perintah `theme.github-dark` dan
`theme.min-light` tidak dibuat lagi (19 → 17 perintah `theme.<id>`), kedua tema tetap
utuh di `THEMES` (jalur baca/`resolveTheme` tidak berubah), dan `scripts/uji-t6-tema-mode.mjs`
memakai kartu `zephyr-light` yang benar-benar ditawarkan (7/7 LULUS, app hidup).

---

## 1. Akar masalah (berkas:baris)

| Berkas:baris | Isi | Peran |
|---|---|---|
| `src/lib/commandRegistry.ts:1467` (HEAD, sebelum lane ini) | `...THEMES.map((t) => ({ id: \`theme.${t.id}\`, …` | **Akar masalah.** Memakai tabel mentah `THEMES`, jadi 2 tema bertanda `tersembunyi` ikut dibuatkan perintah. |
| `src/lib/themes.ts:76` | `tersembunyi?: boolean;` | Sumber tanda ketersembunyian (satu-satunya). |
| `src/lib/themes.ts:104` | `{ id: 'github-dark', label: 'GitHub Dark', kind: 'dark', …, tersembunyi: true }` | Tema tersembunyi #1. |
| `src/lib/themes.ts:110` | `{ id: 'min-light', label: 'Min Light', kind: 'light', …, tersembunyi: true }` | Tema tersembunyi #2. |
| `src/lib/themes.ts:127–129` | `PETA_TEMA_TERSEMBUNYI = { 'github-dark': 'zephyr-dark', 'min-light': 'zephyr-light' }` | Padanan untuk `resolveTheme`. |
| `src/lib/themes.ts:157–158` | `export const semuaTema = (): ThemeInfo[] => [...THEMES, ...temaEkstensi].filter((t) => !t.tersembunyi);` | **Satu sumber kebenaran "ditawarkan"** (pemilih memakai ini). |
| `src/styles/themes-extra.css:446` | `[data-theme='github-dark'] {` | Blok CSS tema tersembunyi **tetap ada** (tidak disentuh). |
| `src/styles/themes-extra.css:622` | `[data-theme='min-light'] {` | Idem. |

Akar masalahnya bukan "kurang satu penyaring". Berkas `themes.ts` sudah menyatakan
kontraknya sendiri di `src/lib/themes.ts:148–156`:

> *"Ini satu-satunya daftar yang boleh dipakai pemilih/komando tema. Menyaring di sini,
> bukan di tiap pemanggil, karena pemanggilnya lebih dari satu (kartu tema, komando
> siklus tema, jembatan dev) dan satu yang lupa menyaring akan menawarkan kembali tema
> yang sudah diputuskan keluar."*

`commandRegistry.ts` adalah pemanggil yang lupa. Akibat nyatanya: memilih
`theme.github-dark` menulis `theme.current = 'github-dark'` — id yang tidak ada di
pemilih mana pun (dulu juga sudah tercatat di
`docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` bagian "sisa permukaan #1").

**Bukti grep (`grep -rn "github-dark\|min-light\|tersembunyi" src/`):** ke-44 baris
kecocokan hanya berisi (i) `src/lib/themes.ts` (tanda + peta padanan), (ii) blok CSS
`src/styles/themes-extra.css`, (iii) **komentar** di `commandRegistry.ts`, (iv) dokumen
di `zephyrDokumenData.ts`. Tidak ada berkas lain yang menyimpan salinan daftar
tersembunyi — jadi memang hanya ada satu sumber, dan hanya satu pemakai yang salah baca.

## 2. Perbaikan (dan pilihan di baliknya)

`src/lib/commandRegistry.ts`:

- baris 36 — impor: `import { THEMES, semuaTema } from './themes';` → `import { semuaTema } from './themes';`
  (`THEMES` jadi tak terpakai → wajib dibuang karena `noUnusedLocals: true`).
- baris 1530–1562 — pembuatan perintah per tema: `...THEMES.map(...)` → `...semuaTema().map(...)`,
  plus komentar yang menjelaskan kenapa sumbernya `semuaTema()`.

**Pilihan: `semuaTema()`, bukan `THEMES.filter((t) => !t.tersembunyi)`.** Versi
`.filter(...)` di `commandRegistry.ts` memang membuat 2 perintah itu hilang, tapi ia
**menyalin syarat "ditawarkan"** ke berkas kedua: definisi "ditawarkan" lalu hidup di
dua tempat, dan setiap perubahan kriteria (mis. tema ekstensi yang ditandai tersembunyi,
atau tambah kriteria baru) harus diingat di keduanya. `semuaTema()` sudah mencakup tema
ekstensi **dan** penyaringnya; memanggilnya berarti tidak ada definisi kedua. Karena itu
harness uji (bagian (f)) **menolak** implementasi `.filter(...)` maupun `.map` atas
`THEMES` — kalau ada yang mengembalikannya, uji merah.

**Tema tersembunyi tidak hilang dari jalur yang masih membacanya** (dicek, tidak diubah):

| Jalur | Berkas:baris | Status |
|---|---|---|
| Field tanda + peta padanan | `src/lib/themes.ts:76,104,110,127–129` | tetap |
| `isKnownTheme` | `src/lib/themes.ts:133` (`THEMES.some(...)`) | tetap — setelan lama user tidak jatuh ke jalur "id tidak dikenal" |
| `infoTema` / `resolveTheme` | `src/lib/themes.ts:161,178–185` | tetap — id tersembunyi dipindah ke pasangannya + dicatat sekali |
| Tema editor CodeMirror | `src/styles/editor-themes.ts:153,159` (`EDITOR_THEME_IDS = THEMES.map(...)`) | tetap, 19 id |
| Jembatan dev | `src/lib/devBridge.ts:280,661` (`THEMES.map((t) => t.id)`) | tetap |
| Dedup tema ekstensi | `src/lib/extLoader.ts:137` | tetap |
| Blok CSS | `src/styles/themes-extra.css:446,622` | tetap |

Yang **tidak** dibuat hanyalah perintah paletnya. Jadi: "disembunyikan dari pemilih"
tidak berarti "dihapus dari aplikasi".

**Catatan trade-off (apa adanya).** `semuaTema()` dipanggil saat modul
`commandRegistry.ts` dievaluasi (array `COMMANDS` statis, dan `daftarkanCommandId()`
ikut berjalan di akhir modul). Tema **ekstensi** yang didaftarkan sesudah titik itu tidak
langsung dapat perintah statis; tema ekstensi yang sudah terdaftar sebelum impor ikut.
Ini bukan regresi: versi lama (`THEMES`) **tidak pernah** memuat tema ekstensi sama
sekali; sesudah perbaikan justru ikut. Tema bawaan tersembunyi (kasus item ini) selalu
benar karena tabelnya statis.

## 3. Harness baru: `scripts/uji-perintah-tema-nyata.mjs` (node-only, tanpa app)

`commandRegistry.ts` di-bundle esbuild dengan modul app (store, React, CodeMirror, i18n)
diganti stub, lalu bundelnya dijalankan di Node. **Yang sengaja TIDAK distub** — karena
justru itu yang diuji — adalah `src/lib/themes.ts`, `src/lib/commandIds.ts`, dan
`commandRegistry.ts` sendiri. Jadi daftar tersembunyi yang dibaca perintah tema adalah
tabel yang sama yang dibaca pemilih, bukan salinannya.

Yang dituntut (6 kelompok, 27 pemeriksaan): (a) tidak ada perintah `theme.*` untuk tema
tersembunyi (palet, `COMMAND_BY_ID`, `COMMANDS`, `findCommand`, dan `runCommand`
benar-benar menolak + tidak menulis setelan), (b) setiap tema yang ditawarkan PUNYA
perintahnya + terdaftar di `COMMAND_IDS`, (c) tidak ada id perintah ganda, (d) `theme.next`
dan `theme.toggleDarkLight` selalu mendarat di tema yang ditawarkan (termasuk saat titik
awalnya id tersembunyi), (e) tema tersembunyi tetap dikenali jalur baca, (f) sumbernya
tidak menyalin syarat "tersembunyi".

```
$ node scripts/uji-perintah-tema-nyata.mjs
=== Perintah tema nyata vs daftar tema yang ditawarkan ===

  CATATAN HARNESS: palet dievaluasi lewat availableCommands() — 166 perintah.

  LULUS  tabel THEMES memuat 2 tema tersembunyi (sumber kebenaran ada)  [github-dark, min-light]
  LULUS  peta padanan menandai tepat tema yang sama (daftar tersembunyi tidak terbelah)
  LULUS  tema tersembunyi TIDAK ditawarkan semuaTema()  [2 tersembunyi, 17 ditawarkan]
  LULUS  (a) tidak ada perintah theme.github-dark di palet  [0 kemunculan]
  LULUS  (a) theme.github-dark juga tidak ada di COMMAND_BY_ID / COMMANDS
  LULUS  (a) findCommand(theme.github-dark) -> undefined
  LULUS  (a) tidak ada perintah theme.min-light di palet  [0 kemunculan]
  LULUS  (a) theme.min-light juga tidak ada di COMMAND_BY_ID / COMMANDS
  LULUS  (a) findCommand(theme.min-light) -> undefined
  LULUS  (a) tidak ada satu pun perintah theme.* yang menunjuk id tersembunyi
  LULUS  (a) runCommand(theme.github-dark) gagal dan tidak menulis setelan  [hasil=false, applySettings dipanggil 0x]
  LULUS  (b) setiap tema di semuaTema() punya perintah theme.<id>  [17 tema]
  LULUS  (b) jumlah perintah tema = jumlah tema yang ditawarkan  [19 perintah theme.* untuk 17 tema]
  LULUS  (b) perintah tema masih terdaftar di COMMAND_IDS (keybinding tetap mengenalinya)  [17/17]
  LULUS  (b) menemukan perintah tema lewat findCommand
  LULUS  (c) tidak ada id perintah ganda di palet  [166 id unik dari 166 perintah]
  LULUS  (c) tidak ada id perintah ganda di COMMANDS  [203 id unik dari 203 perintah]
  LULUS  (d) theme.next selalu mendarat di tema yang ditawarkan (termasuk saat mulai dari id tersembunyi)  [18 titik mulai]
  LULUS  (d) theme.next tidak pernah mendarat di tema tersembunyi
  LULUS  (d) tema.toggleDarkLight (mode dark) -> zephyr-light dan tetap tema yang ditawarkan
  LULUS  (d) tema.toggleDarkLight (mode light) -> zephyr-dark dan tetap tema yang ditawarkan
  LULUS  (d) perintah theme.nord memasang theme.current=nord
  LULUS  (e) isKnownTheme tetap mengenali id tersembunyi (setelan lama tidak jatuh ke jalur "tidak dikenal")
  LULUS  (e) resolveTheme memindahkan id tersembunyi ke pasangannya  [github-dark -> zephyr-dark, min-light -> zephyr-light]
  LULUS  (e) id tersembunyi tidak pernah jadi hasil render
  LULUS  (f) commandRegistry.ts mengambil perintah tema dari semuaTema()
  LULUS  (f) commandRegistry.ts tidak menyalin syarat "tersembunyi"  [tidak ada filter/predikat tema tersembunyi yang disalin]

  Perintah theme.<id> : THEMES mentah = 19, sesudah = 17 (dibuang: theme.github-dark, theme.min-light); perintah meta (next/toggleDarkLight) tetap 2

== 27/27 lulus ==
EXIT=0
```

**Keterbatasan harness (apa adanya).** Daftar palet di harness berisi 166 perintah dari
203 entri `COMMANDS`: perintah yang punya `enabled()` bergantung state app dipulangkan
`false` oleh stub, jadi tersaring keluar. Perintah tema tidak punya `enabled`, sehingga
bagian (b)/(c)/(d) menguji ke-19 perintah tema secara utuh — bukan sebagian. Tidak ada
pemeriksaan yang dilemahkan demi hijau: yang tidak bisa diperiksa di Node (DOM pemilih,
palet yang dirender) justru diperiksa di app hidup, bagian 5 di bawah.

### 3a. Kontrol negatif (membuktikan ujinya memang menggigit)

Perbaikan dibalik sementara ke versi HEAD, harness dijalankan, lalu dipulihkan:

```
$ cp src/lib/commandRegistry.ts "$TMPDIR/registry-asli-backup.ts"
$ # patch: import semuaTema -> THEMES ; ...semuaTema().map( -> ...THEMES.map((
$ node scripts/uji-perintah-tema-nyata.mjs   → EXIT=1
  GAGAL  (a) tidak ada perintah theme.github-dark di palet  [1 kemunculan]
  GAGAL  (a) runCommand(theme.github-dark) gagal dan tidak menulis setelan  [hasil=true, applySettings dipanggil 1x]
  GAGAL  (a) tidak ada satu pun perintah theme.* yang menunjuk id tersembunyi  […, theme.github-dark, …, theme.min-light]
  GAGAL  (b) jumlah perintah tema = jumlah tema yang ditawarkan  [21 perintah theme.* untuk 17 tema]
  GAGAL  (d) theme.next selalu mendarat di tema yang ditawarkan  [zephyr-dark -> undefined | …]
  GAGAL  (f) commandRegistry.ts mengambil perintah tema dari semuaTema()
== 15/27 lulus ==
$ cp "$TMPDIR/registry-asli-backup.ts" src/lib/commandRegistry.ts   # dipulihkan
$ node scripts/uji-perintah-tema-nyata.mjs   → EXIT=0, == 27/27 lulus ==
```

Jadi 27/27 itu bukan "selalu hijau": dengan bug-nya kembali, 12 pemeriksaan merah
(termasuk bukti bahwa perintah tersembunyi benar-benar bisa dijalankan dan menulis
setelan).

## 4. `scripts/uji-t6-tema-mode.mjs`

Nama tema diverifikasi dulu ke sumbernya: `zephyr-light` ada di
`src/lib/themes.ts:81` (`kind: 'light'`, **tanpa** `tersembunyi`) → memang kartu yang
dirender. Berkas di disk **sudah** memakai nama itu:

- baris **71**: `await pilihKartu('zephyr-light');` ← pemanggilan (ini yang penting)
- baris **64**: kata `min-light` masih ada, tapi **di dalam komentar** (menjelaskan kenapa
  id itu tidak bisa dipakai lagi) — bukan pemanggilan.
- `grep -n "min-light" scripts/uji-t6-tema-mode.mjs` → hanya baris 64 (komentar).
- Catatan: berkas ini **untracked** (`git status --porcelain` → `?? scripts/uji-t6-tema-mode.mjs`),
  jadi tidak ada versi HEAD untuk dibandingkan (`git cat-file -e HEAD:…` → tidak ada).

Dijalankan di app hidup (Edge WebView 127.0.0.1:9223):

```
$ node scripts/uji-t6-tema-mode.mjs
=== Mode tampilan vs tema aktif (C3) ===

  LULUS  T1 pill "Zephyr Dark" memindah tema aktif  theme.current=zephyr-dark
  LULUS  T2 yang dirender = zephyr-dark  data-theme=zephyr-dark
  LULUS  T2 kartu aktif = yang dirender  kartu=zephyr-dark
  LULUS  T3 kartu tema terang → pill jadi Zephyr Light  pill=Zephyr Light
  LULUS  T3 kartu aktif = nord-light  kartu=nord-light
  LULUS  T4 mode "system" mengikuti OS  resolve=zephyr-dark osGelap=true
  LULUS  T5 state bentrok: yang dirender & kartu aktif sama (tak diam-diam)  render=zephyr-light resolve=zephyr-light kartu=zephyr-light
EXIT=0
```

7/7 LULUS, exit 0. **Tidak** "BUTUH APP" — app memang hidup di lane ini.

## 5. Bukti di app hidup tanpa stub (probe sekali pakai, di luar repo)

Harness Node menguji fungsi; bagian ini menguji yang di layar. Skrip sekali pakai di
`C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/probe-palet-verdict.mjs` (di luar repo,
pola sama seperti skrip sekali pakai lane sebelumnya) mengimpor modul asli
`/src/lib/commandRegistry.ts` + `/src/lib/themes.ts` **di dalam app** lalu membandingkan
perintah tema di palet dengan `semuaTema()`:

```
$ node .../probe-palet-verdict.mjs
  jumlahBarisTema: 17
  dariPalet:  [Nord, … 17 label …]      ditawarkan: [Nord, … 17 label …]
  sama: true                    selisihPalet: []        selisihTema: []
  adaGithubDark: false          adaMinLight: false
  perintahTemaApp: 19           perintahTemaTersembunyi: []
  kartu di pemilih (DOM): 17    kartuTersembunyi: []
  hiddenPunyaPerintah (findCommand): []      ganda: false
BUKTI APP: LULUS
EXIT=0
```

Palet perintah di UI nyata, kueri `theme` → 20 baris: **17 baris `Theme: <label>` yang
persis sama dengan `semuaTema()`** (himpunan identik, selisih dua arah kosong) + 3 perintah
tema lain (`Settings: Color Theme`, `Accessibility: High Contrast Theme`,
`Preferences: Color Theme (siklus berikutnya)`). Tidak ada baris `Theme: GitHub Dark` /
`Theme: Min Light`. Kueri `github` → `0` ("No matching commands."). Pemilih tema di DOM
= 17 kartu, tanpa `github-dark`/`min-light`.

Catatan jujur soal metode: kueri palet dengan tanda `.` atau `-` (mis. `theme.`,
`min-light`) memulangkan 0 baris bahkan untuk perintah yang **ada** (`solarized` → 1
baris, `zephyr-light` → 0) — pencocokan palet tidak menoleransi tanda baca. Karena itu
bukti di atas memakai kueri alfanumerik (`theme`, `github`, `min`, `zephyr`) dan
pencocokan **himpunan label**, bukan pencarian string bertanda baca.

## 6. `npx tsc --noEmit`

```
$ npx tsc --noEmit
(0 baris keluaran)
EXIT=0
```

## 7. Jumlah perintah tema: sebelum vs sesudah

| Ukuran | Sebelum (HEAD:1467 `...THEMES.map`) | Sesudah (`...semuaTema().map`) |
|---|---|---|
| Perintah `theme.<id>` (per tema) | **19** | **17** |
| Perintah `theme.*` total (termasuk meta) | 21 | **19** |
| `theme.github-dark`, `theme.min-light` | ada (bisa dijalankan, menulis setelan) | **tidak ada** (`findCommand` → `undefined`, `runCommand` → `false`) |
| Perintah meta (`theme.next`, `theme.toggleDarkLight`) | 2 | 2 (tidak berubah) |
| Tema di pemilih (`semuaTema()`) | 17 | 17 |
| Tema di tabel `THEMES` | 19 | 19 |
| Tema dikenali `isKnownTheme` | 19 | 19 |
| Entri `COMMANDS` / id unik | 203 / 203 | 203 / 203 (0 ganda) |

## 8. Sisa yang BUTUH APP (atau BUTUH lane lain)

1. **Bagian CDP `scripts/uji-t5-tema.mjs`** (milik lane lain) belum dijalankan lane ini.
   Yang menggantikannya di sini: bagian 5 (uji palet + pemilih di app hidup) dan
   `uji-t6-tema-mode.mjs`. Kalau harness itu mau dijalankan juga, app harus hidup.
2. **Perintah tema dari tema ekstensi yang didaftarkan setelah `commandRegistry.ts`
   di-import** (lihat catatan trade-off di bagian 2) hanya bisa diverifikasi di app hidup
   dengan meng-install ekstensi tema lalu memeriksa palet: tidak ada tema ekstensi yang
   terpasang di lingkungan ini, jadi jalur itu **belum** diuji — bukan "lulus".
3. **`scripts/verify0*.mjs` / `scripts/uji-keymap-live.mjs`** tidak dijalankan (bukan
   milik lane ini dan butuh app); perubahan di sini tidak menyentuh keybinding, tapi
   `COMMAND_IDS` untuk 2 id tema ikut hilang — itu **dicek** di harness bagian (b)
   (ke-17 id tema yang ditawarkan tetap terdaftar) dan di app (`perintahTemaApp: 19`).
4. **Label kosmetik** di `scripts/shot-sesi-ini.mjs` (komentar "grid 19 tema") dan
   `scripts/uji-t5-tema.mjs` masih menyebut 19; angkanya sekarang 17 untuk pemilih.
   Bukan milik lane ini → tidak diubah.

## 9. Berkas yang diubah / dibuat

| Berkas | Perubahan |
|---|---|
| `src/lib/commandRegistry.ts` | impor `THEMES` → hanya `semuaTema` (baris 36); `...THEMES.map(...)` → `...semuaTema().map(...)` (baris 1552) + komentar alasan (1530–1551) dan komentar siklus tema (656–665). |
| `scripts/uji-perintah-tema-nyata.mjs` | **BARU** — harness node-only (esbuild + stub), 27 pemeriksaan (a)–(f). |
| `scripts/uji-t6-tema-mode.mjs` | sudah memakai `pilihKartu('zephyr-light')` (baris 71); diverifikasi + dijalankan ulang (7/7, exit 0). |
| `docs/PERINTAH-TEMA-TERSEMBUNYI.md` | **BARU** — dokumen ini. |

Tidak diubah (sengaja): `src/lib/themes.ts`, `src/styles/**`, `src/components/**`,
`src-tauri/**`, `src/lib/commands.ts`, `src/lib/keybindings.ts`, `src/lib/devBridge.ts`,
`scripts/verify*.mjs`, `scripts/mock-ai.mjs`.
