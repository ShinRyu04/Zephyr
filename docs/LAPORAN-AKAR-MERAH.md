# LAPORAN AKAR MERAH — skrip uji Zephyr

Dibuat: 2026-10-14 (lane "akar-merah"). Pemilik berkas ini: lane akar-merah.
Branch: `feat/ai-panel-vscode-layout`. Repo: `D:/Zephyr`.

Aturan yang dipakai saat menyusun laporan ini: **tidak ada kode produk yang diubah**
(`src/**`, `src-tauri/**` read-only), tidak ada `git add/commit`, tidak ada berkas dihapus.
Usulan tambalan di bawah **belum diterapkan**.

## Cara bukti dikumpulkan

| Sumber | Isi |
|---|---|
| `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/kes-canon.json.jsonl` | sapuan lane lain (hidup, bertambah saat dibaca: 118 -> 377 baris). Dipakai hanya sebagai *daftar* merah, bukan sebagai kebenaran akhir. |
| Dijalankan sendiri (maks 6 merah, tanpa app) | `cek-aturan-operasional`, `cek-batas-inti`, `cek-bundel-docs`, `cek-cakupan-fakta`, `cek-cap-payload` (semua exit=1, output disimpan di `C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/akar/*.out`) + `cek-agent-jejak.mjs` (wajib; dijalankan saat app masih hidup: **2/3**, prekondisi gagal). |
| `scripts/akar-merah.mjs` (BARU, read-only) | probe bukti milik lane ini: mode `state` / `cap` / `fakta` / `docs`. Tidak pernah memanggil `send`, `cancel`, atau tool yang mengubah keadaan. |
| Bukti statis | pembacaan berkas sumber + `sha1sum` fixture + analisis regex sendiri atas `src/lib/i18n*.ts` (bukan menjalankan skrip merahnya). |

Catatan keadaan app: port debug 9223 sempat **mati di tengah pengerjaan** (curl ditolak), lalu
hidup lagi (`http=200`). Skrip yang butuh app karena itu tidak bisa dipercaya hasilnya selama
periode itu — semua status "butuh app" di bawah ditandai apa adanya.

## Ringkasan angka

- JSONL saat dibaca: **377 baris** = 222 BUTUH_APP, 120 HIJAU, **22 MERAH**, 12 MENGGANTUNG, 1 RUSAK.
- MERAH yang **kujalankan sendiri**: 6 dari 22 (sisanya dibedah dari sumber + JSONL, lihat bagian akhir).
- Kategori atas 22 MERAH: **(a) cacat produk = 1**, **(b) harness salah = 9**, **(c) basi indeks/dokumen = 3**, **(d) butuh app = 6**, **(e) fixture sengaja = 3**.
- RUSAK `cek-event-load.mjs` dan 12 MENGGANTUNG: (d) butuh app (app bergoyang saat sapuan).
- Merah yang **bukan cacat produk**: 21 dari 22. Satu-satunya cacat produk nyata: **`cek-cap-payload.mjs` -> `src/lib/contextBudget.ts`**.

## Tabel utama — 22 MERAH + 1 RUSAK

| Skrip | Status sekarang | Kategori | Akar + bukti (berkas:baris) | Usulan | Pemilik berkas |
|---|---|---|---|---|---|
| `cek-agent-jejak.mjs` | MERAH 2/3 (app hidup) | (b) harness — prekondisi; +(d) | 2 invarian yang jadi alasan skrip ini ada **lulus** (batal menutup loop: `busyAkhir=false`, `streaming=false`); yang gagal hanya prekondisi "agent benar-benar sempat jalan": `{saatJalan:false, pesanBaru:0}`. Penyebab `send()` tidak memulai run dalam 1500 ms tidak bisa kupastikan karena app mati sebelum kubuktikan (dugaan: `activeIds['']` != `activeId` di `src/lib/aiStore.ts:4267`, sementara harness membaca `sessions[st.activeId]`). **Dugaan, bukan bukti.** | jadikan prekondisi = SKIP (exit 2, pola yang sudah dipakai skrip ini untuk kasus tanpa kunci), jangan GAGAL | `scripts/cek-agent-jejak.mjs`; kalau ternyata produk: `src/lib/aiStore.ts` (**milik lane lain**) |
| `cek-aturan-operasional.mjs` | MERAH 1/6 aturan; kini crash | (b) harness; +(d) | jarum basi: `scripts/cek-aturan-operasional.mjs:43` mencari `'plan 2 to 5 steps in todo_write'`, teks nyatanya `'plan 2-5 steps in todo_write'` di `src/lib/systemPrompt.ts:203` (ID-nya juga sudah "2-5": `systemPrompt.ts:300`). 5 aturan lain lulus. | ganti jarum di baris 43 (lihat tambalan B1) | `scripts/cek-aturan-operasional.mjs` |
| `cek-backtick.mjs` | MERAH (usage) | (b) alat, bukan uji | `pakai: node scripts/cek-backtick.mjs <berkas>` — skrip ini alat pemeriksa argumen, bukan uji yang bisa lulus sendiri | perlakukan sebagai alat: keluar 0 + usage, atau pindahkan ke `scripts/alat/` | `scripts/cek-backtick.mjs` |
| `cek-batas-inti.mjs` | MERAH, `VERDICT: GAGAL - 1 pemeriksaan` | (c) basi indeks (DITUNDA) | satu-satunya keluhan: `src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbernya` (cek lain lulus: blok inti 7950 char ~1988 token, ambang 8000) | regenerate `gen-fakta-zephyr.mjs` — **sengaja ditunda**, jangan diusulkan sekarang | `src/lib/zephyrIndeks.ts` (**milik lane lain**) |
| `cek-bridge.mjs` | MERAH | (b) harness; +(d) | `scripts/cek-bridge.mjs:8` `r.result.value` padahal `cdp.eval()` sudah mengembalikan nilainya langsung (`scripts/lib-cdp.mjs:314`: `return r.result?.result?.value`) -> `TypeError: Cannot read properties of undefined` | pakai `r` langsung (tambalan B2) | `scripts/cek-bridge.mjs` |
| `cek-bundel-docs.mjs` | MERAH, 3 merah | (c) basi bundel | `54 berkas nyata vs 41 terbaca`; 13 dok hilang dari bundel; artefak bundel tidak sama dengan hasil panen (54 berkas / 652 bagian). Probe sendiri: dokumen nyata mtime 22:40–23:07 semuanya **setelah** mtime `src/lib/zephyrDokumenData.ts` (2026-10-13T22:27:39) | jalankan `gen-dokumen-bundel.mjs` (ditunda, sekelas basi indeks) | `src/lib/zephyrDokumenData.ts` |
| `cek-cakupan-fakta.mjs` | MERAH, 2 keluhan | (c) basi indeks | `gen-fakta-zephyr --check` GAGAL + `404/420` berkas sumber di luar indeks (16 berkas). Probe sendiri: 16 berkas `src/`+`src-tauri/src` mtime > indeks `2026-10-14T22:01:08` | regenerate indeks (ditunda) | `src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts` (**milik lane lain**) |
| `cek-cap-payload.mjs` | MERAH 10/11 | **(a) CACAT PRODUK** | `scripts/cek-cap-payload.mjs:68` menuntut `gUkuran <= PAYLOAD_MAX_CHARS`; nyatanya `2701517 -> 50230` (cap 40_000, `src/lib/contextBudget.ts:93`). Akar: `ringkasUkuran()` sengaja tidak pernah memangkas giliran terakhir — pass 1 `contextBudget.ts:151` (`i < clone.length - 1`), pass 2 `:182` + `:186-188`, pass 3 `:223` (`clone.length > 2`). Untuk TEKS itu benar; untuk gambar base64 di giliran terakhir, cap tidak akan pernah tercapai. | tambalan A (lihat bawah) | `src/lib/contextBudget.ts` (**milik lane lain**) |
| `cek-i18n.mjs` | MERAH, exit 1 | (b) harness terlalu ketat | analisis statisku atas berkas yang sama: `src/lib/i18n.ts` 10 kamus x 372 kunci bersih; `src/lib/i18n-extra.ts` EN 2321 kunci vs 9 bahasa lain 2404 -> **83 kunci ada di semua bahasa tapi tidak di EN** (mis. `Add to queue`, `Close tab`, `Compact context`). Ini **tidak** menghilangkan teks: `translate()` berakhir `... ?? key` (`src/lib/i18n.ts:3951-3957`), dan kunci itu memang teks Inggrisnya sendiri | longgarkan aturan "extra" untuk kamus EN (tambalan B3) | `scripts/cek-i18n.mjs` |
| `cek-kunci-indo.mjs` | MERAH (ENOENT) | (b) alat butuh artefak antara | `scripts/cek-kunci-indo.mjs:11` membaca `%LOCALAPPDATA%/Temp/indo-bersih.json` yang **tidak ada** (kubuktikan), dan **tidak ada produsennya di repo** (grep `indo-bersih` hanya menemukan pembacanya) | jalankan pemindai yang menghasilkan berkas itu dulu, atau beri pesan jelas + exit 2 (tambalan B4) | `scripts/cek-kunci-indo.mjs` |
| `cek-lsp-pasang-ui-live.mjs` | MERAH (exit 2) | (b) prekondisi berantai; +(d) | `scripts/cek-lsp-pasang-ui-live.mjs:47-50` `slot docker tidak ditemukan - jalankan dulu: cek-lsp-pasang-live.mjs` — memang keluar 2 dengan pesan jelas | biarkan (exit 2 = prekondisi, bukan merah); catat di daftar "urutan jalan" | `scripts/cek-lsp-pasang-ui-live.mjs` |
| `cek-narasi-id.mjs` | MERAH 1/9 | (b) harness — pengukuran gagal + jarum ID basi; +(d) | pengukuran pertama mengembalikan `r.result` kosong (`import: {}`) sehingga `h={}`; lalu 8 aturan tidak pernah dievaluasi tapi tetap dicetak `GAGAL`, dan cek pemulihan `uiLang` **lulus palsu** (`undefined === undefined`). Jarum ID `'Setiap langkah kerja disertai'` (`scripts/cek-narasi-id.mjs:50`) **tidak ada di seluruh `src/`**; aturan ID-nya sudah ditulis ulang di `src/lib/systemPrompt.ts:323` (`'Katakan apa yang sedang kamu kerjakan sambil mengerjakannya.'`) | guard hasil evaluate + ganti jarum (tambalan B5) | `scripts/cek-narasi-id.mjs` |
| `cek-muter-browser.mjs` | MERAH | (d) butuh app | `GAGAL siklus tutup-buka halaman yang sama BERHENTI :: browser_open(muter=0) -> browser_read(...)` — butuh app + agent hidup | jalankan dengan app hidup | `scripts/cek-muter-browser.mjs` |
| `cek-panel-tools-10bahasa.mjs` | MERAH | (d) butuh app | `GAGAL T0 picker tool tidak terbuka lewat menu "..." -> Chat Settings` | jalankan dengan app hidup | `scripts/cek-panel-tools-10bahasa.mjs` |
| `cek-panel-tools-bahasa.mjs` | MERAH | (d) butuh app | T1–T3 lulus (67 tool, 0 deskripsi kosong), kegagalan di tahap UI berikutnya | jalankan dengan app hidup | `scripts/cek-panel-tools-bahasa.mjs` |
| `cek-pemilih-model.mjs` | MERAH | (d) butuh app | `placeholder katalog: local-default, custom-model, custom2-model` + `contoh baris: []` — DOM app tidak terbaca | jalankan dengan app hidup | `scripts/cek-pemilih-model.mjs` |
| `cek-reasoning-hidup.mjs` | MERAH | (d) butuh app/provider | `sebelum: {"effort":"high","model":"mock-model","provider":"custom"}` lalu `kirim: {"ok":false,...}` — app memang jalan dengan provider `custom`/model `mock-model` (probe `akar-merah.mjs state` juga melihat ini) | jalankan dengan app + provider yang benar-benar menjawab | `scripts/cek-reasoning-hidup.mjs` |
| `cek-semua-section.mjs` | MERAH (exit 13) | (d) butuh app | `Warning: Detected unsettled top-level await` — WebSocket app hilang di tengah skrip (app mati saat sapuan) | jalankan dengan app hidup | `scripts/cek-semua-section.mjs` |
| `uji-bug-hunt.mjs` | MERAH (exit 2) | (e) FIXTURE | `BERHENTI: tes sudah lulus di awal` — kubuktikan sendiri: `cd D:/Testing/bug-hunt && node tes/jalankan.js` -> **exit=0**. Fixture memang harus GAGAL dulu | kembalikan fixture ke keadaan buggy (bukan cacat produk) | `D:/Testing/bug-hunt` (fixture, di luar repo) |
| `uji-bug-kejam-verifikasi.mjs` | MERAH | (e) FIXTURE | `GAGAL K3 total laporan COCOK hitungan manual: 365500 vs ...`; kubuktikan `sha1sum` 4 berkas inti (`kasir.js`, `laporan.js`, `data/keranjang.json`, `KELUHAN.md`) **identik** dengan `.asli/` -> fixture masih apa adanya (bug belum diperbaiki). Verifier ini memang alat pasca-perbaikan | jangan disalahkan; jalankan setelah ada run agen | `D:/Testing/bug-kejam` (fixture) |
| `uji-diff-hijau.mjs` | MERAH (ENOENT) | (e)/(d) fixture hilang | `scripts/uji-diff-hijau.mjs:17` menulis `D:/Talos/__uji-diff__.txt`; kubuktikan **`D:/Talos` tidak ada** | buat/pulihkan fixture `D:/Talos`, atau beri pesan prekondisi + exit 2 | `scripts/uji-diff-hijau.mjs` |
| `uji-guard-listener.mjs` | MERAH 2/4 | (b) harness terpaku nama | `scripts/uji-guard-listener.mjs` menuntut literal `let mcpShotListenerBound = false`. Di `src/App.tsx:1241-1246` dan `:1263` guard-nya ada **dengan bentuk lain**: penanda objek `jembatanMCP.shot` / `jembatanMCP.connect` (+komentar alasan di `App.tsx:1276-1280`). `onAiChunk`/`onGitProgress` lulus karena memang pakai nama `aiListenerBound`/`gitProgressListenerBound` (`App.tsx:173`, `:220`) | tambalan B6 | `scripts/uji-guard-listener.mjs` |
| `cek-event-load.mjs` (RUSAK) | RUSAK | (d) butuh app | `lib-cdp.mjs:432 Error: TypeError: Failed ...` — skrip menggerakkan UI (tutup tab terminal, buka pane browser) dan app sedang tidak sehat | jalankan dengan app hidup | `scripts/cek-event-load.mjs` |
| 12 MENGGANTUNG | timeout sapuan | (d) butuh app | `cek-dari, cek-dom-xterm, cek-emoji-donate, cek-ghost10, cek-ghost3, cek-hapus-key, cek-hydra-live, cek-indo3, cek-keystate09, cek-pengetahuan-2lapis, uji-hydrafusion, uji-keadaan-prompt` — semuanya lewat CDP 9223 | jalankan ulang saat app stabil | `scripts/*` |
| 222 BUTUH_APP | bukan status merah | (d) | sapuan menolak menjalankannya tanpa app | — | — |

## USULAN TAMBALAN — BELUM DITERAPKAN

### A. `src/lib/contextBudget.ts` — cacat produk (cap payload) — **milik lane lain**

Bukti: `cek-cap-payload.mjs:68` gagal `2.701.517 -> 50.230` dengan cap `40.000` (`contextBudget.ts:93`).
Ketiga pass memang melewatkan pesan terakhir: `:151` (`i < clone.length - 1`), `:182` (idem) dan `:223` (`clone.length > 2`).

Tambalan minimal (sisipkan **setelah baris 156**, sebelum komentar pass 2):

```ts
  /*
   * Pass 1b: gambar di giliran TERAKHIR juga harus boleh dilepas.
   *
   * Aturan "giliran terakhir utuh" benar untuk teks, tapi salah untuk gambar:
   * satu screenshot base64 lebih besar daripada seluruh transkrip, jadi cap
   * tidak akan pernah tercapai selama gambar di giliran terakhir ikut dikirim.
   * Terbukti di app hidup: 2.701.517 -> 50.230 karakter, cap 40.000.
   * Yang dilepas hanya gambarnya; teks giliran terakhir tetap utuh, dan
   * gambarnya dikembalikan lagi kalau ternyata tidak menolong.
   */
  if (ukuran() > cap) {
    const akhir = clone[clone.length - 1];
    if (akhir && Array.isArray(akhir.images) && (akhir.images as unknown[]).length > 0) {
      const simpan = akhir.images;
      clone[clone.length - 1] = { ...akhir, images: [] } as T;
      if (ukuran() > cap) clone[clone.length - 1] = { ...akhir, images: simpan } as T;
    }
  }
  if (ukuran() <= cap) return [...sistem, ...clone];
```

Kalau **masih** di atas cap (kasus ekstrem: giliran terakhir adalah satu hasil tool raksasa
tanpa gambar), invarian "giliran terakhir utuh" harus dikalahkan oleh batas keras gateway.
Usulan kedua (pilih salah satu, jangan dua-duanya):

```ts
  // di akhir pass 2 (setelah baris 197), sebelum pass 3:
  if (ukuran() > cap) {
    const iTerakhir = clone.length - 1;
    const m = clone[iTerakhir];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length > STUB) {
      clone[iTerakhir] = {
        ...m,
        content: `${isi.slice(0, STUB)}\n\n[giliran terakhir dipotong karena satu request melebihi batas gateway: ${isi.length} karakter, hanya ${STUB} pertama yang dikirim]`,
      } as T;
    }
  }
  if (ukuran() <= cap) return [...sistem, ...clone];
```

Konsekuensi yang harus diuji sesudah tambalan: pass 3 tetap tidak boleh meninggalkan `tool`
tanpa `tool_calls` (`contextBudget.ts:199-237`), dan `cek-cap-payload.mjs` harus 11/11.
Saya tidak menerapkan apa pun — berkas ini milik lane lain.

### B. Perbaikan harness (`scripts/`, milik lane akar-merah)

**B1 — `scripts/cek-aturan-operasional.mjs:43`**
```diff
-  ['todoWrite', 'plan 2 to 5 steps in todo_write'],
+  ['todoWrite', 'plan 2-5 steps in todo_write'],
```
(teks nyata: `src/lib/systemPrompt.ts:203`; padanan ID `systemPrompt.ts:300` juga "2-5")

Tambahan di berkas yang sama (robustness, baris 59-61): `JSON.parse(r.result?.result?.value ?? '{}')`
meledak `SyntaxError: "[object Object]" is not valid JSON` ketika evaluate tidak mengembalikan
string. Usul:
```diff
-const st = JSON.parse(r.result?.result?.value ?? '{}');
+const mentah = r.result?.result?.value;
+if (typeof mentah !== 'string') {
+  console.log(`TIDAK BERLAKU: evaluate app tidak mengembalikan JSON (dapat ${typeof mentah}).`);
+  process.exit(2);
+}
+const st = JSON.parse(mentah);
```

**B2 — `scripts/cek-bridge.mjs:8`**
```diff
-console.log('BRIDGES:', r.result.value);
+console.log('BRIDGES:', r);
```
alasan: `scripts/lib-cdp.mjs:314` (`return r.result?.result?.value;`) — `cdp.eval()` mengembalikan
nilai, bukan respons mentah. Perbaiki juga `r2` di bawahnya dengan pola yang sama.

**B3 — `scripts/cek-i18n.mjs`** (bagian penghitung `extra`): kunci yang hilang dari kamus `EN`
di `i18n-extra.ts` tidak menghilangkan teks karena fallback terakhir `translate()` adalah `key`
itu sendiri (`src/lib/i18n.ts:3951-3957`). Usul: jangan hitung `extra` untuk kamus `EN`, atau
hitung hanya kunci yang nilainya BUKAN identitas:
```diff
-    if (extra.length) { console.log('     EXTRA:', extra.slice(0, 8)); bad++; }
+    if (extra.length && n !== 'EN') { console.log('     EXTRA:', extra.slice(0, 8)); bad++; }
```
(catatan: kalau tim memang ingin kamus EN lengkap, itu pekerjaan terjemahan — bukan merah uji ini.)

**B4 — `scripts/cek-kunci-indo.mjs:11`** — beri prekondisi, jangan ENOENT:
```diff
-const bersih = JSON.parse(fs.readFileSync(path.join(TMP, 'Temp', 'indo-bersih.json'), 'utf8'));
+const berkas = path.join(TMP, 'Temp', 'indo-bersih.json');
+if (!fs.existsSync(berkas)) {
+  console.log(`TIDAK BERLAKU: ${berkas} belum ada - jalankan dulu pemindai prosa Indonesia.`);
+  process.exit(2);
+}
+const bersih = JSON.parse(fs.readFileSync(berkas, 'utf8'));
```

**B5 — `scripts/cek-narasi-id.mjs`** — dua perbaikan:
```diff
-      ['narasi', 'Setiap langkah kerja disertai'],
+      ['narasi', 'Katakan apa yang sedang kamu kerjakan'],
```
(teks nyata `src/lib/systemPrompt.ts:323`; jarum lama tidak ada di seluruh `src/`)

dan penjaga pengukuran (sesudah baris 85):
```diff
+if (!h.id || !h.en || Object.keys(h.id).length !== 4 || Object.keys(h.en).length !== 4) {
+  console.log('TIDAK BERLAKU: pengukuran di app gagal (evaluate balik kosong) - bukan bukti aturan hilang.');
+  process.exit(2);
+}
```
Selain itu cek pemulihan `uiLang` harus menolak pembanding `undefined === undefined`
(`const pulih = h.asli !== undefined && h.uiLangDipulihkan === h.asli;`).

**B6 — `scripts/uji-guard-listener.mjs`** — jangan terpaku nama penanda; terima bentuk objek
`jembatanMCP` yang memang dipakai `src/App.tsx:1241-1246`/`:1263`:
```js
const target = {
  'onAiChunk': ['aiListenerBound'],
  'onMcpScreenshot': ['mcpShotListenerBound', 'jembatanMCP.shot'],
  'onMcpConnect': ['mcpConnectListenerBound', 'jembatanMCP.connect'],
  'onGitProgress': ['gitProgressListenerBound'],
};
// adaGuard = ada `let <nama> = false` + `if (!<nama>` ATAU ada `if (!<nama>)` untuk bentuk objek
```
Inti yang benar-benar harus dibuktikan tetap sama: **satu event tidak dipasang dua kali**.

### C. Yang **sengaja TIDAK** diusulkan sekarang

- Regenerate `zephyrIndeks.ts` / `zephyrDokumenData.ts` / fakta: **ditunda** (keputusan lane lain).
  Merah (c) di atas akan tetap merah sampai itu dilakukan — dan bertambah satu setiap dokumen baru
  ditulis. Dokumen ini sendiri (`docs/LAPORAN-AKAR-MERAH.md`) menambah satu berkas ke daftar itu.
- Tidak ada pemeriksaan yang dilonggarkan lewat penghapusan, dan tidak ada status yang kunyatakan
  hijau: semua yang kujalankan masih **exit=1** saat laporan ini ditulis.

## MERAH YANG BELUM KUPERIKSA SENDIRI (apa adanya)

Kuota "maks 6 skrip merah dijalankan" habis pada: `cek-agent-jejak`, `cek-aturan-operasional`,
`cek-batas-inti`, `cek-bundel-docs`, `cek-cakupan-fakta`, `cek-cap-payload`.
Sisanya **hanya dibedah dari sumber + JSONL**, tanpa menjalankan:

| Skrip | Alasan tidak dijalankan |
|---|---|
| `cek-i18n.mjs` | kuota habis; diganti analisis regex sendiri atas `src/lib/i18n.ts` + `i18n-extra.ts` (hasil identik dengan keluaran JSONL: 83 kunci EN kurang) |
| `cek-kunci-indo.mjs` | kuota habis; bukti ENOENT diambil dari JSONL + `ls` berkas yang dituntutnya |
| `cek-lsp-pasang-ui-live.mjs`, `cek-muter-browser.mjs`, `cek-panel-tools-10bahasa.mjs`, `cek-panel-tools-bahasa.mjs`, `cek-pemilih-model.mjs`, `cek-reasoning-hidup.mjs`, `cek-semua-section.mjs` | butuh app; app sedang bergoyang/mati saat itu |
| `uji-bug-hunt.mjs`, `uji-bug-kejam-verifikasi.mjs`, `uji-diff-hijau.mjs` | kuota habis; fixture diperiksa langsung (`node tes/jalankan.js`, `sha1sum` vs `.asli`, `ls D:/Talos`) |
| `uji-guard-listener.mjs` | kuota habis; akar dibuktikan statis dari `src/App.tsx` |
| `cek-backtick.mjs`, `cek-bridge.mjs` | kuota habis; akar terbaca dari sumber (usage / `r.result.value`) |
| `cek-event-load.mjs` + 12 MENGGANTUNG + 222 BUTUH_APP | butuh app / jaringan; app mati di tengah pengerjaan |

## Lampiran — keluaran nyata yang kujalankan (exit code + baris akhir)

```
EXIT=1  cek-aturan-operasional   -> SyntaxError: "[object Object]" is not valid JSON at cek-aturan-operasional.mjs:61:17
EXIT=1  cek-batas-inti           -> GAGAL indeks sinkron dengan sumber | VERDICT: GAGAL - 1 pemeriksaan
EXIT=1  cek-bundel-docs          -> GAGAL artefak sinkron ... [BASI ...54 berkas / 652 bagian] | 54 vs 41 | hilang: 13 dok
                                    VERDICT BUNDEL DOKUMEN: GAGAL - 3 merah
EXIT=1  cek-cakupan-fakta        -> GAGAL gen-fakta-zephyr --check | semua berkas sumber masuk indeks (404/420)
                                    GAGAL - 2 keluhan
EXIT=1  cek-cap-payload          -> GAGAL screenshot + tool output dipotong [2701517 -> 50230] | == 10/11 lulus ==
2/3     cek-agent-jejak          -> GAGAL celah: tidak ada penolakan senyap tanpa kunci {...pesanBaru:0, saatJalan:false...}
                                   (dijalankan saat app hidup; 2 invarian lain lulus)
exit=0  akar-merah.mjs docs      -> dokumen nyata = 45, terdaftar di bundel = 41, tidak ada di bundel = 11
                                   (semua mtime 2026-10-13T22:40..23:07 > mtime bundel 2026-10-13T22:27:39)
exit=0  node tes/jalankan.js (D:/Testing/bug-hunt) -> exit=0  (fixture TIDAK dalam keadaan buggy)
sha1    bug-kejam kasir.js/laporan.js/keranjang.json/KELUHAN.md -> SAMA dengan .asli (fixture belum diperbaiki)
ls      D:/Talos -> No such file or directory  (fixture uji-diff-hijau hilang)
```
