# Catatan Keputusan Sesi — 2026-10-14

Satu tempat untuk **semua keputusan penting sesi ini**, supaya tidak hilang di
antara obrolan. Tiap butir: **keputusan + alasan + berkas rujukan**. Angka yang
dikutip adalah hasil ukur sesi ini (disebut sumbernya), bukan perkiraan.

Cabang: `feat/ai-panel-vscode-layout`. Lane ini **dokumen saja** — tidak ada
berkas `src/**` atau `src-tauri/**` yang diubah.

---

## (a) Marketplace = Opsi C hybrid

**Keputusan.** Marketplace Zephyr memakai **Opsi C**: katalog resmi Zephyr jadi
bawaan; jalur internet (Open VSX / GitHub) ada di opsi **Advanced** yang **mati
dari default**; paket **berkode ditolak saat pasang** dengan pesan jelas; paket
**deklaratif** (tema/ikon/snippet/keymap/grammar) boleh. **Allowlist https
`open-vsx.org` tidak dilonggarkan** dan **extension host sengaja TIDAK
termasuk**.

**Alasan.** Katalog resmi menjamin "terpasang = ada perubahan" tanpa jaringan;
jalur internet dibuka hanya oleh pengguna sendiri + label "belum diuji" supaya
risiko tidak ditanggung diam-diam; menolak paket berkode lebih jujur daripada
memasang lalu nol efek (Zephyr belum punya *extension host*).

**Rujukan.** `docs/KEPUTUSAN-MARKETPLACE-j5.md` §1–§3, §5. Allowlist nyata:
`src-tauri/src/ext_pkg.rs:1642` (`IZIN = ["open-vsx.org", "www.open-vsx.org"]`),
https-only di `ext_pkg.rs:1644`. Rincian teknis: `docs/SPESIFIKASI-EKOSISTEM-EKSTENSI-ZEPHYR.md`.

### Tolok ukur "jadi" (DoD)

Sumber `docs/KEPUTUSAN-MARKETPLACE-j5.md` §4 (6 butir bernomor) + §3 (1 syarat
gerbang) = **7 butir "jadi"**:

1. Saklar Advanced ada di Settings, **default mati**, keadaannya tersimpan.
2. Saklar mati → tab Marketplace **hanya** menampilkan katalog resmi (dan tetap
   ada isinya, bukan kosong).
3. Saklar nyala → hasil dari sumber luar muncul dengan label "belum diuji" +
   sumbernya (Open VSX/GitHub) tertulis.
4. Paket berkode → **ditolak** dengan pesan, dan **tidak** muncul sebagai
   "Installed".
5. Paket deklaratif → setelah dipasang ada **bukti perubahan** per jenis (tema:
   warna UI + warna kode; ikon: jumlah ikon; snippet: jumlah snippet; keymap:
   jumlah pintasan berubah; bahasa: mode aktif).
6. Uninstall → keadaan kembali seperti sebelum dipasang, dan Zephyr melaporkan
   apa yang dikembalikan.
7. **(gerbang izin, §3)** Allowlist domain `IZIN` di `ext_pkg.rs` tetap
   `open-vsx.org`/`www.open-vsx.org`, https saja; batas ukuran paket
   (`MAX_ZEXT_BYTES`) dan indeks (`MAX_INDEX_BYTES`) tetap berlaku; pemeriksaan
   `id_aman` + kecocokan engine tetap berlaku. **Tidak menambah domain baru
   tanpa keputusan baru.**

---

## (b) Katalog bawaan: 118 → 105, 13 paket bahasa dibuang

**Keputusan.** Katalog bawaan **worktree = 105 paket** (HEAD = 118); **13 paket
bahasa dilepas sengaja** karena sudah didukung native. **3 syarat wajib**: (1)
alasannya ditulis di katalog, (2) UI bilang "sudah didukung bawaan", (3) ikon
ketinggalan dibersihkan.

**Angka (sumber: `node scripts/cek-katalog-jumlah.mjs`, keluaran nyata).**
Gabungan HEAD **118** vs worktree **105**, selisih **13**, seluruhnya kategori
Languages (101 → **88**); Language = 101 HEAD vs **88** worktree; id baru di
worktree = 0.

**Alasan.** Uji dua lapis di `docs/KEPUTUSAN-KATALOG-118-105.md` §2: (lapis 1)
daftar ekstensi paket dipangkas karena ekstensinya sudah di peta bawaan
`BY_EXT`; (lapis 2) aturan `src/lib/lang.ts:111` (`if (detectLang(nameOrPath)
!== 'plain') return null;`) membuat **peta bawaan menang** untuk setiap ekstensi
yang sudah dikenalnya → ke-13 paket itu **tidak pernah aktif bahkan di HEAD**,
pemasangannya nol efek. Melepasnya tidak menghilangkan fitur, hanya baris daftar
yang menyesatkan.

**Bukti native.** `src/lib/lang.ts` (`BY_EXT`, 61 kunci; pemuat grammar
`loadLangExtension`), `src/lib/cmLegacyModes.ts` (mode legacy CodeMirror 5),
`package.json` (`@codemirror/lang-*` + `@codemirror/legacy-modes`).

**Sisa yang belum beres (jujur).** `src-tauri/src/ext_lang_icons.rs` tabel
`LOGO_URI` masih menyimpan **12 entri ikon mati** (id paket yang sudah dilepas) —
contoh `ext_lang_icons.rs:30` (`zephyr.lang-javascript`). Skrip
`scripts/cek-katalog-jumlah.mjs` menandainya sebagai `PERINGATAN - IKON
KETINGGALAN` (sengaja peringatan, exit tetap 0). Pembersihan = lane kode, **belum
dikerjakan**.

**Rujukan.** `docs/KEPUTUSAN-KATALOG-118-105.md` §1–§8.

---

## (c) Token warna kode = `--syn-*` (11 token × 19 tema)

**Keputusan.** Token warna kode di Zephyr bernama **`--syn-*`**, **bukan**
`--syntax-*`. Ada **11 token**, dan tiap tema mendefinisikan kesebelasnya.

**Angka terukur.** `grep -o -- "--syn-[a-z-]*:" src/styles/theme.css | sort -u`
→ 11 nama unik: `--syn-attr`, `--syn-comment`, `--syn-function`,
`--syn-invalid`, `--syn-keyword`, `--syn-number`, `--syn-operator`,
`--syn-string`, `--syn-tag`, `--syn-type`, `--syn-variable`. Tabel `THEMES` di
`src/lib/themes.ts` = **19 baris** (`grep -c "id: '"` = 19); `grep -rho --
"--syn-keyword:" src/styles/ | wc -l` = **19** → 19 tema × 11 token.

**Alasan.** Nama `--syn-*` sudah dipakai lintas berkas tema
(`theme.css`, `theme-light.css`, `themes-extra.css`, `a11y.css`); memakai nama
lain untuk hal yang sama hanya menambah permukaan yang harus dijaga. Konsekuensi
penting (lihat (d)): tema ekstensi **wajib bisa memulihkan `--syn-*`**, sebab
warna editor itulah alasan orang memilih tema.

**Rujukan.** `src/styles/theme.css`, `theme-light.css`, `themes-extra.css`,
`a11y.css`; `src/lib/themes.ts`; `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` §Bukti angka.

---

## (d) 2 tema kembar disembunyikan (angka persen miripnya)

**Keputusan.** `github-dark` dan `min-light` **berhenti ditawarkan** di pemilih
tema (→ pasangannya `zephyr-dark` dan `zephyr-light`). Keduanya **tidak dihapus**:
baris tetap di tabel `THEMES`, `isKnownTheme`/`infoTema` tetap mengenali id-nya,
blok CSS tetap ada. Yang berubah: `semuaTema()` tidak lagi mengembalikannya.

**Angka (hasil ukur, pembanding `var: nilai` pada blok tema di
`src/styles/theme.css`).**

| Pasangan | var:nilai identik | Token `--syn-*` identik | Putusan |
|---|---|---|---|
| `github-dark` vs `zephyr-dark` | **72%** (26/36) | **11/11 sama persis** | disembunyikan |
| `min-light` vs `zephyr-light` | **61%** (22/36) | **11/11 sama persis** | disembunyikan |
| pasangan lain | 0–6% | — | tidak relevan |

**Alasan.** Yang membedakan dari pasangan lain: **seluruh 11 token warna kode
(`--syn-*`) identik**. Tema yang seluruh warna kodenya sama bukan "mirip" —
dua-duanya pilihan yang sama dengan label berbeda. Membuangnya tidak menghapus
warna apa pun (dijadikan paket ekstensi resmi nanti).

**Yang sengaja dipertahankan.** `solarized-light` (0% vs `zephyr-light`),
`nord-light` (3%), `high-contrast` (tema aksesibilitas).

**Migrasi aman.** `THEMES` tetap 19 baris; `tersembunyi?: boolean` menandai 2
baris; `resolveTheme` memindahkan ke pasangan via `PETA_TEMA_TERSEMBUNYI`
(`github-dark`→`zephyr-dark`, `min-light`→`zephyr-light`) dan mencatatnya
**sekali per id** (`console.info`). Setelan user **tidak** ditulis ulang.

**Verifikasi nyata.** `node scripts/uji-t5-tema.mjs` bagian A **semua LULUS** (17
tema ditawarkan, 19 baris tabel, 2 tersembunyi, peta padanan benar); `npx tsc
--noEmit` **0 error**; bagian B **GAGAL `ECONNREFUSED` :9223** — app tidak hidup di
lane ini (bukan kegagalan kode).

**Rujukan.** `docs/KEPUTUSAN-TEMA-KEMBAR-2026-10-14.md` (seluruhnya),
`src/lib/themes.ts`.

---

## (e) Urutan pengerjaan: 7/8/9 di ekor

**Keputusan.** Urutan wajib kerja:

1. **Kerjaan biasa** (fitur/perbaikan rutin).
2. **Temuan obrolan** (hal yang muncul di percakapan).
3. **TERAKHIR**: **i18n final (P7)** → **sapu bug (P8)** → **commit (P9)**.

**Alasan.** i18n final dan sapu bug menyapu seluruh permukaan yang disentuh
pekerjaan sebelumnya, jadi kalau dikerjakan lebih awal akan langsung basi saat
kerjaan biasa menambah/mengubah string; commit paling akhir supaya satu commit
memuat keadaan yang sudah bersih dan tersapu.

**Rujukan.** Daftar kerja `docs/plan-kerja.md` (item P7/P8/P9) + aturan lane sesi ini.

---

## (f) Pagar kerja (wajib, jangan dilanggar)

**Keputusan.** Selama sesi ini:

- **Jangan commit**, **jangan `git add -A`**, **jangan `rm` wildcard** (dan jangan
  hapus berkas/script apa pun).
- **Jangan `sed`/`awk`** untuk mengedit — pakai alat baca/tulis berkas.
- Tiap klaim "selesai" **wajib punya bukti nyata** (keluaran perintah, bukan
  deskripsi).
- Gerbang mutu: `npx tsc --noEmit` **0 error**; `cargo test --lib` **hijau**.
- **Jangan tindak tanpa perintah**; kalau ragu → **tanya**, jangan tebak.

**Alasan.** Repo publik `github.com/ShinRyu04/Zephyr` **sengaja** tidak memuat
`src/`, `src-tauri/`, `scripts/` — **jangan pernah commit folder itu ke repo
publik**. Repo kerja lokal punya backup wajib di
`D:\Backups\Zephyr-RESCUE\zephyr-full-history.bundle` sebelum operasi git berat.

**Rujukan.** `docs/ATURAN-KERJA.md` §1, §2, §5, §6; pagar lane sesi ini.

---

## (g) Keputusan lain yang ikut dicatat

- **Zeph AI nempel KANAN saja (ala VS Code).** Chat dirender sebagai kolom kanan
  (`App.tsx:1484–1487`: *"AI: the chat as a right-hand column — VS Code's
  secondary side bar"*, hanya untuk `aiPanel === 'right'`). **Panel bawah murni
  Terminal** — posisi AI tidak menyentuh panel bawah maupun lebar editor.
  Rujukan: `src/App.tsx:1484`, `src/components/shell/TerminalPanel.tsx:114`.
- **Zeph AI = tool internal + MCP.** "Blok inti" ≤ **2.000 token**; indeks
  pengetahuan Zephyr = **6.192 entri** (terverifikasi:
  `zephyrIndeks.ts:2` + `grep -c` = 6192; rincian bridge=1, dokumen=176,
  ekstensi=17, kode=398, label=3023, layar=1962, menu=122, panel=22, perintah=179,
  pintasan=66, port=4, seksi=31, setelan=124, tool=67). Anggaran blok nyata yang
  ditemukan: `aiMemori.ts:185` `ANGGARAN_BAWAAN = 1400`, `aiMemori.ts:188`
  `BATAS_TOKEN_BAWAAN = 1000`, `zephyrRuntime.ts:33` `BATAS_KEADAAN = 900`.
  Rujukan: `src/lib/zephyrIndeks.ts`, `src/lib/zephyrCari.ts`, `src/lib/aiMemori.ts`,
  `src/lib/zephyrRuntime.ts`.
  **Catatan angka (2026-10-14, item `angka-dokumen-tool-68`):** indeks sudah di-regen sesudah sesi ini →
  **6.254 entri**, kategori `tool=68` (lihat `docs/LAPORAN-REGEN-INDEKS-DAN-HARNESS-VERSI.md`). Jadi angka
  6.192 / `tool=67` di butir ini adalah potret sesi 2026-10-14 pagi, bukan keadaan sekarang; katalog kode
  sendiri = **68** (`TOOL_COUNTS`).
- **Ekstensi vs plugin.** Ekspansi ekosistem (tema/ikon/snippet/keymap/bahasa)
  dirancang di `docs/SPESIFIKASI-EKOSISTEM-EKSTENSI-ZEPHYR.md`; peran sub-agen
  berketik di `docs/PERAN-SUBAGEN-ZEPH.md`.

---

*Dokumen ini merangkum keputusan sesi 2026-10-14. Bila ada keputusan baru yang
bertentangan, dokumen ini yang diperbarui — bukan diabaikan diam-diam.*
