# LAPORAN PROMPT 6 — Bersihkan artefak + klasifikasi script uji (untracked)

Tanggal: 2026-10-13 · Repo: `D:/Zephyr` (branch `feat/ai-panel-vscode-layout`)
Sifat pekerjaan: **READ-ONLY** — tidak ada berkas dihapus, tidak ada `git add`, tidak ada commit.

---

## 1. Artefak `ZEPHYR-UJI-COBA.txt`

**Tidak ada yang perlu dihapus — berkasnya SUDAH tidak ada.** Bukti:

| Cek | Perintah | Hasil |
|---|---|---|
| isi disk (akar repo) | `ls -la D:/Zephyr/ZEPHYR-UJI-COBA.txt` | `No such file or directory` |
| isi disk (luas) | `find /d /c/Users/Zyrex -maxdepth 3 -iname "ZEPHYR-UJI-COBA*"` | kosong |
| git index | `git ls-files -- '*UJI-COBA*'` | kosong |
| git status | `git status --porcelain -- '*UJI-COBA*'` | kosong |

**ASAL-USULNYA (ditemukan, bukan tebakan):** nama itu hidup di dalam harness uji
`scripts/uji-ai-berat.mjs` — **bukan berkas nyasar**:

- baris **71**: tugas yang diberikan ke agen Zephyr —
  `'4. Tulis berkas BARU bernama ZEPHYR-UJI-COBA.txt di akar workspace, isinya: nama berkas yang kamu baca tadi.'`
- baris **153**: harness menghitung target verifikasinya —
  `const target = (st.workspace || '') + '/ZEPHYR-UJI-COBA.txt'`

Jadi berkas itu **artefak yang sengaja dibuat oleh tugas uji** `uji-ai-berat`
(uji tugas multi-langkah: baca → tulis → verifikasi). Berkasnya sudah tidak
tertinggal di akar repo, jadi tugas 1 PROMPT 6 **tidak butuh aksi hapus**.
Pelacakan git: `git log --all -S'ZEPHYR-UJI-COBA'` → commit `dae81e8`
("Agent host session bf5bc5a7… baseline checkpoint") — commit yang menambahkan
`.gitignore` + `scripts/uji-ai-berat.mjs`; string itu sendiri tidak pernah
masuk ke index sebagai berkas.

---

## 2. Hitungan nyata (bukan "~102")

| Kelompok | Jumlah |
|---|---|
| `scripts/uji-*.mjs` **ter-track** | **82** |
| `scripts/uji-*.mjs` **untracked** | **61** |
| untracked `.mjs` di akar `scripts/` (semua pola, termasuk `_*.mjs`) | 83 |
| untracked `.mjs` di `scripts/_arsip/` | 86 |
| total untracked `.mjs` di `scripts/` | 169 |

Catatan: 86 untracked di `_arsip/` adalah probe sekali-pakai yang **sengaja**
diarsipkan (lihat item `lama-scratch`) — bukan berkas nyasar.

---

## 3. Klasifikasi 20 script unggulan (header DIBACA, bukan ditebak)

Kelas ditentukan dari isi berkas: **MURNI** = tidak menyentuh CDP/bridge app;
**BUTUH-APP** = memanggil `Cdp.attach(...)`.

### 3.1 MURNI — 12/12 sesuai dugaan ✔ (tanpa app, tanpa port, tanpa jaringan)

Semuanya mengimpor **hanya** `reporter` dari `./lib-cdp.mjs` (helper cetak
hasil) dan membaca berkas sumber; `Cdp.attach` = 0, `9223` = 0, `8098` = 0.
Prasyarat: repo ada di disk + `node`. Dua di antaranya memanggil proses luar:
`uji-potong-hasil` (spawn 1×) dan `uji-git-bar` (spawn 1×) → butuh `git`/`npm`
di PATH.

| # | Script | Byte | Catatan isi |
|---|---|---|---|
| 1 | `uji-potong-hasil.mjs` | 6.712 | potongan hasil tool sisakan kepala+ekor |
| 2 | `uji-blame-gabung.mjs` | 6.627 | blame digabung per commit |
| 3 | `uji-konteks-tugas.mjs` | 5.183 | substitusi variabel konteks task runner |
| 4 | `uji-git-bar.mjs` | 7.624 | parser unified diff |
| 5 | `uji-mcp-luar.mjs` | 5.279 | tool server MCP luar |
| 6 | `uji-aturan-tool.mjs` | 8.987 | aturan izin per-tool (gerbang keamanan) |
| 7 | `uji-rangkai-format.mjs` | 7.395 | rantai formatter eksternal |
| 8 | `uji-aturan-proyek.mjs` | 5.885 | penemuan berkas aturan proyek |
| 9 | `uji-checkpoint.mjs` | 6.345 | logika checkpoint agen |
| 10 | `uji-hunk-diff.mjs` | 7.345 | terima/tolak per-hunk |
| 11 | `uji-search-editor.mjs` | 6.965 | penggabungan petikan pencarian |
| 12 | `uji-urutan-roboh.mjs` | 15.894 | bentuk wire tetap sah saat balasan hilang |

### 3.2 BUTUH-APP — 8/8 sesuai dugaan ✔ (semua `Cdp.attach` = 1)

| # | Script | Byte | Prasyarat nyata (dari isi berkas) |
|---|---|---|---|
| 1 | `uji-hook-hidup.mjs` | 7.227 | CDP **9223**; **workspace WAJIB** (komentar :45 — executor hook menolak tanpa workspace; script membuka sendiri via `openWorkspace()` :58); **provider ASLI + API key** (:135 "memanggil provider SUNGGUHAN dengan kunci yang ada di mesin ini — bukan mock") |
| 2 | `uji-ai-hidup.mjs` | 4.689 | CDP **9223**; agent idle; **API key ada untuk provider aktif** (assert `A2`); workspace terbuka (tugas membaca `package.json` akar workspace); arg ke-3 opsional |
| 3 | `uji-ai-berat.mjs` | 7.333 | CDP **9223**; **workspace terbuka** (assert `B2`, keluar lebih awal kalau tidak ada); **provider ASLI**; **izin tulis** — menghasilkan artefak `ZEPHYR-UJI-COBA.txt` di akar workspace |
| 4 | `uji-navigasi-hidup.mjs` | 5.122 | CDP **9223**; agent idle; **provider ASLI**; **TIDAK butuh workspace** — halaman target disediakan script sendiri (`http.createServer` + `listen` di `127.0.0.1:<port uji>`) |
| 5 | `uji-muter-browser.mjs` | 5.274 | CDP **9223**; **provider ASLI** (tugas navigasi nyata, model memanggil `browser_read` berulang; menguji guard treadmill) |
| 6 | `uji-riwayat-langkah.mjs` | 5.175 | CDP **9223**; **provider ASLI** (menjalankan giliran nyata lalu memeriksa bentuk wire riwayat) |
| 7 | `uji-agent-shape.mjs` | 5.972 | CDP **9223** + **MOCK PROVIDER di `http://127.0.0.1:8098`** (assert `S1` versi 6 siap); script mengarahkan `baseUrl` provider aktif ke mock lalu **memulihkan** setelan semula (:138) |
| 8 | `uji-deepseek-shape.mjs` | 4.334 | CDP **9223** + **provider DEEPSEEK ASLI** (assert `D1` nama model cocok `/deepseek/i`; **menolak jalan** kalau `baseUrl` masih menunjuk mock (`D3`)) → butuh API key DeepSeek + model deepseek aktif |

Ringkas prasyarat (untuk keputusan track):
`9223` dibutuhkan oleh **8/8** script BUTUH-APP ·
`workspace terbuka` dibutuhkan oleh **3** (`hook-hidup`, `ai-hidup`, `ai-berat`) ·
`API key / provider asli` dibutuhkan oleh **6** (`hook-hidup`, `ai-hidup`, `ai-berat`, `navigasi-hidup`, `muter-browser`, `riwayat-langkah`, `deepseek-shape`=7) ·
`mock 8098` dibutuhkan oleh **1** (`agent-shape`).

Konsekuensi praktis: 12 script MURNI bisa di-track **dan** dijalankan di CI mana
pun tanpa app. 7 script BUTUH-APP butuh app hidup + provider ber-key (kecuali
`agent-shape` yang cukup mock 8098 — paling aman untuk CI/lokal).

---

## 4. Status batasan (dipatuhi)

- ✔ Tidak ada berkas/script yang dihapus (0 `rm`, 0 `git clean`).
- ✔ Tidak ada `git add`, tidak ada `git commit`.
- ✔ Tidak ada wildcard pada `scripts/` untuk add/rm (semua operasi per-berkas eksplisit).
- Alat bantu yang dibuat (di luar repo): `scratch/klasifikasi-script-uji.py`,
  `scratch/probe-prompt6.py`, `scratch/klasifikasi-script-uji.json`.
