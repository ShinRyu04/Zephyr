# Tema Zephyr wajib mengubah warna kode sintaks (11 token `--syn-*`)

Dokumen bukti untuk keputusan:

- **KEPUTUSAN 1** — Tiap tema Zephyr WAJIB mengubah warna kode sintaks, bukan cuma warna UI. Kontraknya 11 token:
  `--syn-keyword`, `--syn-string`, `--syn-number`, `--syn-comment`, `--syn-function`,
  `--syn-variable`, `--syn-type`, `--syn-operator`, `--syn-tag`, `--syn-attr`, `--syn-invalid`.
- **KEPUTUSAN 2** — Tema bawaan dikurangi dan/atau dipindah menjadi ekstensi; status apa adanya ada di bagian 6.

Harness bukti: **`scripts/uji-tema-warna-kode.mjs`** (`node scripts/uji-tema-warna-kode.mjs`).
Semua angka di dokumen ini adalah keluaran nyata harness/`probe`, bukan dugaan.

---

## 1. Ambang LULUS/GAGAL (N yang dipakai)

Dicetak harness di baris kedua setiap kali dijalankan:

| Ambang | Nilai | Arti |
|---|---|---|
| `N_tema_kembar` | **1** | Satu warna token boleh dipakai maksimal 1 tema lain, dan HANYA bila kedua tema terdaftar sebagai pasangan kembar di `PETA_TEMA_TERSEMBUNYI`. Warna yang muncul di ≥3 tema → GAGAL; sama antar 2 tema bukan pasangan terdaftar → GAGAL. |
| `N_token_sama_berantai` | **3** | Dua tema dianggap "kembar warna kode" kalau berbagi ≥3 token `--syn-*` bernilai sama. Dipakai di uji DOM hidup. |
| `kontras_min` | **4.4** | Rasio kontras tiap warna token terhadap `--editor-bg` temanya. |
| `sebar_terang_gelap` | **0.15** | Jarak minimum rerata luminance warna kode tema terang vs tema gelap. |

Exit code: **0** kalau semua lulus, **1** kalau ada `GAGAL`. Bagian yang tidak bisa diuji tanpa app hidup ditandai `BUTUH APP`, tidak membuat exit ≠ 0, dan tetap dihitung "dilewati".

---

## 2. Angka SEBELUM → SESUDAH

Tiga kolom, karena "sebelum" punya dua arti: **sumber ter-commit** (`git HEAD`, `--head`) dan **working tree sebelum tambalan lane ini**. Keduanya diukur dengan harness yang sama.

| Ukuran | SEBELUM — `git HEAD` (`--head`) | SEBELUM — working tree, sebelum tambalan | SESUDAH — working tree sekarang |
|---|---|---|---|
| Tema terdaftar | 19 | 19 | 19 |
| Tema punya blok CSS `[data-theme]` | 19 | 19 | 19 |
| Tema dengan 11/11 token `--syn-*` | **9** | 19 | **19** |
| Tema dengan token `--syn-*` sebagian | **10** (kurang `variable/type/operator/tag/attr/invalid`) | 0 | **0** |
| Pasangan kembar tersembunyi terdaftar | 0 (peta belum ada) | 2 (`github-dark`, `min-light`) | 2 |
| Tema ditawarkan / tersembunyi | 19 / 0 | 17 / 2 | 17 / 2 |
| `TOKEN_OVERRIDE` | tidak ada di berkas | 31 token, `--syn-*` = **7/11** | 31 token, `--syn-*` = **11/11** |
| Alias `--syntax-*` dipakai-tak-didefinisikan | `--syntax-variable` | `--syntax-variable` | **tidak ada** |
| Hasil harness | GAGAL di B, C, D, E | **`== 14/16 lulus ==`, exit 1** (D & E GAGAL) | **`== 22/22 lulus ==`, exit 0** (dengan DOM hidup; `== 16/16 lulus ==` kalau `--tanpa-dom`) |

Yang 10 tema di HEAD itu: `dracula, catppuccin-mocha, rose-pine, kanagawa, everforest-dark, github-dark, ayu-mirage, solarized-light, nord-light, min-light` — masing-masing kurang 6 token yang sama.

Catatan kejujuran soal kepemilikan perubahan: dalam working tree ada **260 berkas** belum ter-commit (+26.977 baris) dari banyak lane. Tambalan milik lane ini spesifik dan kecil: `TOKEN_OVERRIDE` 7→11 di `src/lib/themes.ts` dan alias `--syntax-variable` di `src/styles/tokens.css` (berkas & baris di bagian 8). Kelengkapan 11 token di 19 blok CSS dan peta kembar **sudah** ada di working tree saat pengukuran pertama lane ini; yang membuktikan semuanya wajib dan tidak ada yang kurang adalah harness, dan yang menutup dua lubang terakhir adalah dua tambalan tersebut.

Angka "SEBELUM working tree" berasal dari run pertama harness di sesi ini (`== 14/16 lulus ==`, exit 1): `D. kontrak override` GAGAL karena `TOKEN_OVERRIDE` cuma 7/11 token `--syn-*`, dan `E. alias` GAGAL karena `--syntax-variable` dipakai tanpa definisi.

---

## 3. Tabel tema × token (19 tema, 11 token `--syn-*`)

Dihasilkan harness dengan `node scripts/uji-tema-warna-kode.mjs --tabel --tanpa-dom` (baca blok CSS `[data-theme='X']`).

| tema | kind | status | `--syn-keyword` | `--syn-string` | `--syn-number` | `--syn-comment` | `--syn-function` | `--syn-variable` | `--syn-type` | `--syn-operator` | `--syn-tag` | `--syn-attr` | `--syn-invalid` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| zephyr-dark | dark | ditawarkan | #ff7b72 | #a5d6ff | #79c0ff | #8b949e | #d2a8ff | #ffa657 | #7ee787 | #79c0ff | #7ee787 | #79c0ff | #f85149 |
| zephyr-light | light | ditawarkan | #cf222e | #0a3069 | #0550ae | #6e7781 | #8250df | #953800 | #1a7f37 | #0550ae | #1a7f37 | #0550ae | #cf222e |
| nord | dark | ditawarkan | #81a1c1 | #a3be8c | #b692b0 | #929db2 | #88c0d0 | #d8dee9 | #8fbcbb | #81a1c1 | #8fbcbb | #8fbcbb | #ec7883 |
| tokyo-night | dark | ditawarkan | #bb9af7 | #9ece6a | #ff9e64 | #7a83ab | #7aa2f7 | #c0caf5 | #2ac3de | #89ddff | #f7768e | #e0af68 | #f7768e |
| gruvbox-dark | dark | ditawarkan | #fb5642 | #b8bb26 | #d3869b | #9b8d7f | #8ec07c | #83a598 | #fabd2f | #fe8019 | #8ec07c | #fabd2f | #ff4f38 |
| one-dark | dark | ditawarkan | #c678dd | #98c379 | #d19a66 | #8d94a1 | #61afef | #e1717a | #e5c07b | #56b6c2 | #e36e77 | #d19a66 | #e36e77 |
| senja | dark | ditawarkan | #ff8c42 | #c3d17a | #e8a33d | #907a72 | #7ec9d1 | #f5c2a0 | #9fbf7f | #e8a33d | #9fbf7f | #c3d17a | #f0625d |
| zephyr-acrylic | dark | ditawarkan | #c084fc | #4ade80 | #fb923c | #6e7f98 | #38bdf8 | #f43f5e | #38bdf8 | #2dd4bf | #f43f5e | #fb923c | #f87171 |
| high-contrast | ? | ditawarkan | #ff9ea8 | #a8e0ff | #9fd0ff | #bdbdbd | #dcbaff | #ffc08a | #8ff2a4 | #9fd0ff | #8ff2a4 | #9fd0ff | #ff8a80 |
| dracula | dark | ditawarkan | #ff79c6 | #f1fa8c | #bd93f9 | #8391b4 | #50fa7b | #f8f8f2 | #8be9fd | #ffb86c | #8be9fd | #ffb86c | #ff6767 |
| catppuccin-mocha | dark | ditawarkan | #cba6f7 | #a6e3a1 | #fab387 | #80859e | #89b4fa | #f5c2e7 | #f9e2af | #89dceb | #f9e2af | #89dceb | #f38ba8 |
| rose-pine | dark | ditawarkan | #c4a7e7 | #f6c177 | #ebbcba | #827d9e | #9ccfd8 | #e0def4 | #9ccfd8 | #908caa | #9ccfd8 | #908caa | #eb6f92 |
| kanagawa | dark | ditawarkan | #957fb8 | #98bb6c | #d27e99 | #88877d | #7e9cd8 | #ffa066 | #e6c384 | #7fb4ca | #e6c384 | #7fb4ca | #ff5d62 |
| everforest-dark | dark | ditawarkan | #e67e80 | #a7c080 | #d699b6 | #919d86 | #83c092 | #e69875 | #dbbc7f | #7fbbb3 | #dbbc7f | #7fbbb3 | #ef8385 |
| github-dark | dark | tersembunyi | #ff7b72 | #a5d6ff | #79c0ff | #8b949e | #d2a8ff | #ffa657 | #7ee787 | #79c0ff | #7ee787 | #79c0ff | #f85149 |
| ayu-mirage | dark | ditawarkan | #ffa759 | #bae67e | #d4bfff | #808c98 | #73d0ff | #ffb454 | #5ccfe6 | #ffd580 | #5ccfe6 | #ffd580 | #ff6666 |
| solarized-light | light | ditawarkan | #697800 | #217e77 | #ca347d | #697373 | #2076b3 | #b84414 | #627100 | #1e6fa7 | #627100 | #1e6fa7 | #c82e2b |
| nord-light | light | ditawarkan | #516e93 | #617254 | #7f647a | #666d7c | #596f85 | #7e6039 | #456f4b | #476791 | #456f4b | #476791 | #af3f49 |
| min-light | light | tersembunyi | #cf222e | #0a3069 | #0550ae | #6e7781 | #8250df | #953800 | #1a7f37 | #0550ae | #1a7f37 | #0550ae | #cf222e |

Cara membaca:

- 19 baris, 11 kolom warna, **0 sel kosong** → tiap tema memang mengubah kode sintaks, tidak ada tema "setengah berganti".
- 17 tema ditawarkan benar-benar berbeda satu sama lain (uji C: "17 tema ditawarkan, semua berbeda nyata").
- 2 baris identik adalah pasangan kembar yang sudah diputuskan & disembunyikan: `github-dark` = `zephyr-dark`, `min-light` = `zephyr-light` (lihat `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md`). Ke-22 duplikat warna antar-tema seluruhnya jatuh di dua pasangan ini — sesuai ambang `N_tema_kembar = 1`.
- Temuan kecil: `high-contrast` tidak punya penanda terang/gelap di registri tema (`kind` = `?`), sedangkan 18 tema lain punya. Uji kontras tetap lulus karena latarnya dibaca dari `--editor-bg`. **Usul**: tambahkan `kind: 'dark'` untuk tema ini di `src/lib/themes.ts` supaya pengelompokan terang/gelap di UI dan di harness tidak menebak.

---

## 4. Apakah tiap tema benar-benar mengubah warna kode? — BUKTI

**Ya, dan dibuktikan dua lapis: statis (blok CSS) dan hidup (DOM app yang benar-benar jalan).**

Statis (bagian B/C/F/G harness, `== 22/22 lulus ==`, exit 0):

- Setiap tema terdaftar punya blok CSS; tema dengan token sebagian **0 dari 19**.
- Tiap tema punya ≥5 warna berbeda di antara 11 token (minimum 7).
- Tiap `--syn-*` di `src/styles/editor-themes.ts` terikat ke variabel tema, bukan warna mati:
  `keyword=langsung string=langsung number=--syntax-number comment=--syntax-comment function=--syntax-fn variable=langsung type=--syntax-type operator=--syntax-operator tag=langsung attr=langsung invalid=langsung` → **11/11**.
- Kontras: terendah 4.50 (ambang 4.4). Latar tema terang `bgLum` 0.86..1.00, gelap 0.01..0.03. Rerata luminance warna kode terpisah: terang maks 0.154, gelap min 0.367, **jarak 0.213** (ambang 0.15) → tema terang vs gelap memang beda kontras, bukan cuma beda hue.

Hidup (bagian I harness, app Zephyr jalan dengan `--remote-debugging-port=9223`, tema diganti lewat jembatan dev `window.__ZEPHYR_THEME__.set(id)`):

```
I. DOM hidup (BUTUH APP kalau Zephyr tidak jalan)
  ok     DOM hidup: tema aktif menyediakan 11/11 token --syn-* — tema aktif "zephyr-dark"
  ok     DOM hidup: warna tema aktif sama dengan blok CSS-nya — 11/11 cocok
  ok     DOM hidup: 11 token terpasang untuk tiap tema yang terbaca — 17 tema lewat __ZEPHYR_THEME__.set(), 0 token kosong
  ok     DOM hidup: pergantian tema benar-benar mengubah warna kode — 17 nilai --syn-keyword berbeda dari 17 tema
  ok     DOM hidup: tak ada dua tema yang kembar warna kode — 0 pasangan kembar (>=3 token sama)
  ok     DOM hidup: warna tiap tema sama dengan blok CSS-nya — 17 tema cocok 11/11
```

Baris kelima dan keenam itu bukti terkuat: warna yang **benar-benar terpakai di DOM** untuk 17 tema ditawarkan sama persis dengan blok CSS tema itu (11/11), dan tidak ada dua tema yang kembar. Jadi yang diuji bukan sekadar "berubah", tapi "berubah ke nilai yang memang ditulis temanya".

Pengamatan tambahan dengan probe terpisah (`probe-bridge-tema.mjs`, satu tema, di luar harness): `window.__ZEPHYR_THEME__.set('nord')` mengubah `--syn-keyword` dari `#ff7b72` menjadi `#81a1c1` — nilai nord yang benar.

Cara harness menghindari kesimpulan palsu:

- Bacaan hanya diterima kalau halaman **mengaku** sedang memakai tema yang diminta (`data-theme === id`). Kalau app reload/HMR di tengah uji (ini terjadi terus di sesi ini karena lane lain mengedit berkas), `data-theme` balik ke bawaan dan warna yang terbaca milik tema lain — bacaan seperti itu **dibuang**, bukan dihitung sebagai GAGAL. Satu tema = satu eval dengan maksimal 3 percobaan.
- `set` dipanggil sebagai metode (`ZT.set(id)`), bukan dijadikan variabel dulu: kalau `set()` metode objek, memisahkannya menghilangkan `this` dan panggilannya jadi no-op yang diam-diam (sempat menghasilkan pembacaan "semua tema kembar" yang menyesatkan; sudah diperbaiki).
- Tema dikembalikan ke tema awal setelah uji.
- Kalau <75% tema berhasil dibaca bersih, bagian itu ditandai `BUTUH APP`, bukan dipaksa lulus/gagal.

**BUTUH APP / belum terbukti di sini:**

- Warna `--syn-*` yang **benar-benar terpakai di `<canvas>` minimap** dan di coretan VS Code (token `tokenColors` dari ekstensi) tidak diuji; yang diuji adalah custom property di `document.documentElement` + pemetaan di `editor-themes.ts`.
- Tema dari ekstensi **VS Code** yang terpasang di mesin ini belum diuji hidup; uji hidup memakai 17 tema bawaan yang ditawarkan bridge.

---

## 5. Cara menjalankan harness

```bash
node scripts/uji-tema-warna-kode.mjs                 # SESUDAH (working tree) + DOM hidup kalau app jalan
node scripts/uji-tema-warna-kode.mjs --head          # SEBELUM: baca dari `git show HEAD:<berkas>`
node scripts/uji-tema-warna-kode.mjs --tabel         # cetak tabel markdown tema x token (bagian 3)
node scripts/uji-tema-warna-kode.mjs --tanpa-dom     # lewati DOM hidup (uji statis saja, cepat)
node scripts/uji-tema-warna-kode.mjs --head --tanpa-dom   # pembanding "sebelum" paling cepat
```

App hidup yang dibutuhkan: Zephyr dev dengan `--remote-debugging-port=9223` (harness menyambung ke `http://127.0.0.1:9223/json/list` lewat `scripts/lib-cdp.mjs`). Bagian DOM hidup dibatasi 150 detik; kalau lewat, bagian itu ditandai `BUTUH APP` dan sisanya tetap dijalankan.

---

## 6. Status tema bawaan vs ekstensi (apa adanya)

**Mekanismenya sudah ada, tapi 19 tema bawaan masih keras di CSS.**

| Hal | Status nyata | Bukti |
|---|---|---|
| Tema bawaan keras di CSS | **19** (`zephyr-dark, zephyr-light, nord, tokyo-night, gruvbox-dark, one-dark, senja, zephyr-acrylic, high-contrast, dracula, catppuccin-mocha, rose-pine, kanagawa, everforest-dark, github-dark, ayu-mirage, solarized-light, nord-light, min-light`) | bagian A/B harness; blok `[data-theme='X']` di `src/styles/theme.css`, `theme-light.css`, `themes-extra.css`, `a11y.css` |
| Tema bawaan yang **dikurangi** | 2 tema "dikurangi" dari daftar tawaran lewat `PETA_TEMA_TERSEMBUNYI` (`github-dark` → `zephyr-dark`, `min-light` → `zephyr-light`) — **tetap keras di CSS**, cuma tidak ditawarkan | `src/lib/themes.ts:127`; `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` |
| Tema yang **sudah** berupa ekstensi | 2 paket, dan keduanya **tidak** ada di 19 tema bawaan: `zephyr.tema-kertas` "Kertas" (light, `./themes/kertas.json`) dan `zephyr.tema-malam` "Malam" (dark, `./themes/malam.json`) | bagian H harness: katalog berkategori Themes 2 vs bundel Rust 2; `src-tauri/src/ext_bundled.rs`, `src-tauri/src/ext_bundled_extra.rs` |
| Token yang dikirim paket ekstensi | **11/11** `--syn-*` untuk keduanya | bagian H: `zephyr.tema-kertas 11/11, zephyr.tema-malam 11/11` |
| Jalur muat tema ekstensi | ada & terpakai: `muatTema()` baca `tokenColors` → `petakanTokenWarna()` → token `--syn-*` → daftar tema → `terapkanTokenEkstensi(id)` saat tema dipakai | `src/lib/extLoader.ts:125` (`muatTema`), `:106` (`tokenColorsTema`), `:508` (`daftarkanTemaEkstensi(...)`), `:74` (`terapkanTokenEkstensi`), :95 (`themesEkstensi()`) |
| `kind` tema | 18 tema punya penanda terang/gelap, `high-contrast` tidak (`?`) | tabel bagian 3 |

**Yang kurang (dan usul tambalan — belum diterapkan, cuma usul):**

1. **Validasi tema ekstensi terlalu longgar.** `src/lib/extLoader.ts:161` cuma menolak tema yang tokennya benar-benar kosong:
   `if (Object.keys(tok).length === 0) { ... gagal ... }`. Tema ekstensi yang cuma mengirim 1 token tetap diterima → bisa muncul lagi kasus "tema setengah berganti kode" yang justru ingin dihapus keputusan ini.
   *Usul*: setelah `petakanTokenWarna`, wajibkan 11 `--syn-*`; kalau tidak lengkap, lengkapi dari tema pasangannya (fallback) ATAU tolak dengan alasan yang jelas. Uji ini sudah ada padanannya di harness bagian H (`tiap paket tema bawaan mengirim 11/11 token --syn-*`), jadi bisa langsung dijadikan gerbang.
2. **Tidak ada daftar "bawaan vs ekstensi" untuk UI.** Satu-satunya penanda adalah `temaEkstensiTerdaftar(id)` (`src/lib/themes.ts:148`). Tidak ada penanda asal-tema (bawaan/ekstensi) yang bisa ditampilkan, jadi "tema bawaan dikurangi" belum terlihat oleh pengguna maupun uji.
   *Usul*: tambahkan asal ke `ThemeInfo` (`asal: 'bawaan' | 'ekstensi'`) dan tampilkan di pemilih tema; harness bisa ikut menghitung "bawaan: N, ekstensi: M".
3. **Belum ada jalan pindah otomatis untuk 19 tema CSS → paket ekstensi.** Blok `[data-theme='X']` di CSS dan daftar `THEMES` di `src/lib/themes.ts` adalah dua tempat keras; paket ekstensi memakai JSON `themes/*.json` + `tokenColors`.
   *Usul konkret (tanpa menyentuh komponen lane lain)*: skrip konversi sekali-jalan yang, untuk tema yang mau dipindah, membaca blok `[data-theme='X']` → tulis `themes/<id>.json` berisi 11 token `--syn-*` (dan warna UI lainnya) → daftarkan di bundel Rust → hapus blok CSS + entri `THEMES`. Setelah itu harness bagian A/B otomatis menunjukkan tema itu hilang dari daftar bawaan dan muncul di katalog ekstensi. Tema kembar (`github-dark`, `min-light`) adalah kandidat pertama yang paling aman karena sudah disembunyikan dan tidak ditawarkan.

Catatan: apakah paket `zephyr.tema-kertas` / `zephyr.tema-malam` benar-benar **terpasang dan aktif** di app yang sedang jalan tidak bisa dibuktikan dari repo (instalasi ada di luar repo, di profil AppData) — **BUTUH APP** untuk membuktikannya. Yang terbukti dari repo: katalog ↔ bundel Rust cocok 2↔2 dan keduanya membawa 11/11 token.

---

## 7. Ringkasan jawaban keputusan

- **Tiap tema mengubah warna kode sintaks: YA.** 19/19 tema punya 11/11 token `--syn-*`; 17 tema ditawarkan semuanya berbeda nyata; bukti hidup: 17 tema diganti satu-satu lewat DOM hidup, semua warnanya sama dengan blok CSS-nya, 0 kembar. Harness: `== 22/22 lulus ==`, exit 0.
- **Sebelumnya tidak begitu.** Di `git HEAD` cuma 9/19 tema yang punya 11/11 token dan 10 tema kekurangan 6 token yang sama; `TOKEN_OVERRIDE` belum ada sehingga Theme Builder tidak bisa menulis warna kode sama sekali (0/11).
- **Tambalan yang menutup lubang terakhir:** `TOKEN_OVERRIDE` 7→11 token `--syn-*` dan alias `--syntax-variable` yang selama ini dipakai tanpa definisi.
- **Tema bawaan vs ekstensi:** mekanisme ekstensi tema sudah jalan dan sudah dipakai untuk 2 paket (Kertas, Malam, keduanya 11/11 token), tapi **19 tema bawaan masih keras di CSS**; yang "dikurangi" baru 2 tema kembar yang disembunyikan, bukan dipindah jadi ekstensi. Tiga tambalan yang masih kurang ada di bagian 6.

## 8. Berkas yang diubah lane ini

| Berkas | Perubahan |
|---|---|
| `scripts/uji-tema-warna-kode.mjs` | **baru** — harness bukti (bagian A–I, mode `--head`/`--tabel`/`--tanpa-dom`, ambang di bagian 1) |
| `docs/TEMA-WARNA-KODE.md` | **baru** — dokumen ini |
| `src/lib/themes.ts` | `TOKEN_OVERRIDE` diperluas 7→**11** token `--syn-*` (**baris 42–52**; `--syn-keyword` baris 42 … `--syn-invalid` baris 52) + docblock blok itu (baris 21–41) diperluas menjelaskan kenapa ke-11 token harus ikut dibersihkan pass `applyTheme` |
| `src/styles/tokens.css` | tambah alias **`--syntax-variable: var(--syn-variable);` (baris 135)** beserta komentarnya (baris 131–134). `--syntax-keyword` (124) dst. sudah ada sebelumnya |

Tidak menyentuh berkas lane lain (`zephyrTools/**`, `subsetAlat.ts`, `devBridge.ts`, `commands.ts`, `systemPrompt.ts`, `zephyrFakta.ts`, `zephyrIndeks.ts`, `keybindings.ts`, `commandRegistry.ts`, `aiStore.ts`, `TemaPratinjau.tsx`, `temaFilter.ts`, `dekorasi*.ts`, `src-tauri/**`).
