# USULAN SISA — ZEPH-BACA-KODE-SAMBUNG (yang BELUM bisa diterapkan)

> Pelengkap `docs/LAPORAN-BACA-KODE-SAMBUNG.md`. Isinya **hanya** pekerjaan yang tidak bisa
> diselesaikan item ini (berkas terlarang / butuh app hidup). Tidak ada berkas `src/**`
> yang disentuh untuk usulan ini.

## 1. `realpath` sungguhan — pagar symlink (BUTUH APP)

Sekarang `pasangJembatanBacaKodeDariWorkspace` (`src/lib/agentTools.ts`) memasang
`realpath: async (p) => p` — bentuk **identitas**, karena backend belum punya perintahnya.
Akibatnya: symlink/junction di dalam repo yang menunjuk **keluar** repo masih bisa dibaca.

**Usul (pilih satu):**

- **(a) Perintah Tauri baru `fs_realpath`** di `src-tauri/src/fs_utils.rs`
  (`std::fs::canonicalize` + hormati pagar "tak boleh folder user"), didaftarkan di
  `src-tauri/src/lib.rs`, lalu `realpath: async (p) => await fsRealpath(p)` dengan pembungkus tipis
  di `src/lib/commands.ts`. Uji: buat symlink `src/keluar.ts -> C:/Users/<user>/.ssh/id_rsa`,
  pastikan jawaban `ditolak: … KELUAR akar repo`. **Butuh app hidup.**
- **(b) Tanpa backend baru:** `realpath` memakai pembaca yang sudah ada + pemeriksaan per-bagian
  (deteksi `lstat` per ruas). Lebih rapuh (Windows junction vs symlink) dan tetap butuh app untuk
  memverifikasi. Rekomendasi: (a).

Catatan: pagar **leksikal** yang sudah ada tetap berlaku penuh dan tidak bergantung pada (a) —
`..`, jalur absolut, UNC, byte kontrol, dan berkas rahasia ditolak **sebelum** jembatan disentuh
(dibuktikan di harness: *"ditolak SEBELUM jembatan disentuh (jejak KOSONG, 0 sentuhan disk)"*).

## 2. Uji end-to-end di runtime Tauri yang hidup (BUTUH APP)

Yang masih stub di harness `scripts/uji-baca-kode-sambung.mjs`: `invoke('fs_read')` / `invoke('fs_stat')`.
Setelah app hidup, jalankan minimal:

1. buka folder `D:\Zephyr`, panggil `zephyr_kode` dengan `{berkas:'src/lib/bacaKode.ts', dari:1, sampai:5}`
   lewat jalur model (`tool_call`) — bukan lewat fungsi internal;
2. berkas nyata **>512 KiB** (mis. hasil bundel) → harus ditolak dengan angka `524288`;
3. berkas dengan baris >400 char dan potongan >6 000 char → pastikan angka batas muncul di jawaban;
4. berkas ber-encoding non-UTF8 dan berkas berakhiran CRLF → pastikan nomor baris tetap konsisten;
5. berkas 0 byte dan folder (bukan berkas) → pastikan alasan penolakan masuk akal, bukan lemparan mentah.

Semua nomor batas ada di `src/lib/bacaKode.ts:76-91`.

## 3. Angka dokumen generator (jangan disentuh item ini)

`docs/plan-kerja.md` masih menyebut "66 tool" saat usulan ini ditulis; **berkas itu sudah dikoreksi**
(2026-10-14, item `angka-dokumen-tool-68` → 68 tool / 26 dikirim; bukti di
`docs/LAPORAN-ANGKA-DOKUMEN-TOOL.md`). Yang masih tertinggal adalah **keluaran generator**:
`src/lib/zephyrDokumenData.ts` (embed dokumen) dan `src/lib/zephyrFakta.ts` / `src/lib/zephyrIndeks.ts`.
Keadaan katalog sekarang **68** (`TOOL_CATALOG` 67→68 lewat U-JT1, `TOOL_COUNTS` dihitung otomatis).
Regenerasi lewat pipeline biasa — ketiga berkas generator itu **dilarang** disunting tangan.

## 4. Kalau kelak `zephyr_kode` ingin SELALU terkirim

Sekarang ia masuk lewat `tambahanKelas` (kelas `baca`, termasuk default) sehingga ikut terkirim pada tugas
"cara kerja X" tanpa menembus `BATAS_TOOL_TUGAS = 20`. Kalau produk ingin ia **selalu** ada, itu berarti
menaikkan cap atau menurunkan sesuatu yang lain — keputusan produk terpisah, bukan bug sambungan ini.
Yang **tidak** boleh: menambah satu keluarga ke `KELUARGA_DASAR` tanpa menaikkan cap (dasar+tulis+web sudah 21).

## 5. Catatan lintas-lane (bukan tugas item ini)

- `scripts/deteksi-duplikat-tool.mjs` melaporkan 3 temuan MERAH di `src/lib/zephyrTools/mcp.ts`
  (`mcp__zephyr__extension`, `mcp__zephyr__wait_for_terminal`, `mcp__zephyr__worktree`: aksi diklaim,
  belum terlayani). Sudah ada sebelum patch ini; berkas itu bukan milik item ini.
- `scripts/inventaris-tool.mjs` memperingatkan `zephyr_self` punya >1 blok handler
  (`builtins.ts:2254` + `zephyrTools/zephyrSelf.ts:492`). Bukan `zephyr_kode`; bukan milik item ini.
- `scripts/uji-jangkauan-tool.mjs` (lane lain) sudah **95/95 LULUS** dengan keadaan baru — asersi lama yang
  mengunci "`zephyr_kode` tidak ada" sudah dibalik pemiliknya. Tidak ada pembalikan tersisa.
