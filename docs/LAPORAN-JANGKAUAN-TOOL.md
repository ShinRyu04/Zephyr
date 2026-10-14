# Laporan Jangkauan Tool — ZEPH-BACA-KODE-SENDIRI

Item: **ZEPH-BACA-KODE-SENDIRI** (+ sisi tool ambil-web)
Pertanyaan: *apakah tool baca-kode dan tool ambil-web benar-benar **TERDAFTAR** dan bisa **DIPANGGIL model** — bukan cuma modul yang ada di repo?*

Harness: `scripts/uji-jangkauan-tool.mjs` — **node murni, deterministik, tanpa jaringan/app/CDP**;
bundel esbuild dari `src/lib/**` asli, dijalankan sebagai CJS di node.

- Hasil: **63/63 kasus LULUS, 0 gagal** (`== RINGKASAN: 63/63 LULUS, 0 GAGAL ==`).
- Determinisme: 2 jalan berturut-turut menghasilkan keluaran **identik** (71 baris, `diff` kosong).
- Type-check: `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` → **0 galat** (keluaran kosong, exit 0).

---

## 1. Vonis ringkas

| # | Yang diklaim | Status | Berkas / baris bukti |
|---|---|---|---|
| 1 | Tool **baca isi berkas kode** (`zephyr_kode`) | **MODUL MATI — tak terjangkau** | spec `name: 'zephyr_kode'` hanya di `src/lib/bacaKode.ts:680`; **NOL importer**; **tidak ada** di `TOOL_CATALOG` (`catalog.ts:271`) |
| 2 | Tool **ambil web** (`web_fetch`) | **TERJANGKAU** (butuh app) | `catalog.ts:221` (katalog) + `catalog.ts:620` (`TOOL_DIKIRIM_SELALU`) + `web.ts:839` (eksekutor) |
| 3 | Modul ambil-web mandiri (`ambilWeb.ts`) | **MODUL MATI — tak terjangkau** | `periksaUrlAmbilWeb` / `saringRahasiaWeb` di `src/lib/zephyrTools/ambilWeb.ts`; **NOL importer** |
| 4 | Gerbang isi-web (`gerbangIsiKonten`) | **TERJANGKAU** (internal, bukan tool) | didefinisikan `kebijakanIsiWeb.ts:238`; dipakai `web.ts:24,463,706,803,839` |
| 5 | Modul baca-kode `bacaKode.ts` (isi logika) | **ADA**, tapi tak tersambung | jembatan `pasangJembatanBacaKode` (`bacaKode.ts:713`) **tidak pernah dipanggil** dari `src/**` mana pun |

**Inti:** satu-satunya yang benar-benar sampai ke model hari ini adalah **`web_fetch`** (ambil web).
**Baca isi berkas kode (`zephyr_kode`) TIDAK PERNAH bisa dipanggil model** — ia ada di repo, lulus ujinya,
tapi tidak terdaftar di katalog, tidak masuk subset, dan tidak ada pemanggil di aplikasi.

---

## 2. Metode & bukti mentah

Harness membundel himpunan **node-murni** `catalog.ts`, `subsetTugas.ts`, `subsetAlat.ts`, `bacaKode.ts`,
`kebijakanIsiWeb.ts` lewat esbuild → CJS → `require`. Modul lapisan-app (`web.ts`, `agentTools.ts`) **tidak** bisa
di-`require` di node (`import.meta.env.DEV` → `Cannot read properties of undefined (reading 'DEV')`), jadi untuk
keduanya dipakai **bukti baris sumber** (`fs.readFileSync` + pencocokan pola), bukan pemanggilan runtime.

Kepala keluaran harness (verbatim):

```
== JEJAK JANGKAUAN TOOL (node murni, offline) ==

katalog: 67 tool | BATAS_TOOL_TUGAS=20
basis-aktif selalu-saja: 26 | basis-aktif penuh: 62

  ✓ web_fetch ADA di katalog tool (TOOL_NAMES runtime)
  ✓ web_fetch ADA di TOOL_DIKIRIM_SELALU (selalu dikirim)
  ✓ web_fetch ADA di TOOL_BY_NAME (bisa di-resolve tool_call)
  ✓ zephyr_kode TIDAK ADA di katalog (TOOL_NAMES)
  ✓ pilihToolTugas(web) MENYERTAKAN web_fetch
  ✓ pilihToolTugas(web) menghormati cap <= 20
  ✓ zephyr_kode TIDAK PERNAH muncul di subset tugas manapun
  ✓ jejakPemilihan() memuat web_fetch (jalur kirim nyata ada)
  ✓ zephyr_kode juga TIDAK ADA di fungsi LAMA alatUntukTugas (subsetAlat.ts)
  ✓ zephyr_kode punya SKEMA argumen lengkap (berkas/dari/sampai/simbol, required=[berkas])
  ✓ zephyr_kode: name==='zephyr_kode' + parameters di berkas sumber
  ✓ web_fetch punya SKEMA argumen (url + max_chars, required=[url]) di web.ts (baris sumber)
  ✓ zephyr_kode punya eksekutor nyata (TOOL_BACA_KODE.run = fungsi)
  ✓ web_fetch punya eksekutor nyata di web.ts (name+run berpasangan)
  ✓ web_fetch TERDAFTAR di AGENT_TOOLS (spread ...TOOL_WEB) — registry tool agent
  ...
== RINGKASAN: 63/63 LULUS, 0 GAGAL ==
SEMUA LULUS.
```

Angka katalog (dihitung runtime dari `TOOL_CATALOG`): **68 tool** = **builtin 43 / mcp 14 / web 11**;
`TOOL_DIKIRIM_SELALU` = **26** tool.

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Dulu di sini tertulis
> "**67 tool** = builtin 42 / mcp 14 / web 11" — `zephyr_kode` kini **sudah** masuk katalog, jadi
> totalnya **68**. Kepala harness verbatim di atas masih memuat `katalog: 67 tool` dan
> `zephyr_kode TIDAK ADA di katalog`; itu potret sapuan sebelum perubahan itu, dibiarkan apa adanya.

---

## 3. Rantai impor nyata ke jalur kirim

Jalur yang benar-benar dipakai model saat ini:

```
src/lib/aiStore.ts:5909  →  pilihToolTugas()  (src/lib/subsetTugas.ts:743)
   ├─ jejakPemilihan()  (subsetTugas.ts:586)   ← yang diuji harness
   │     ├─ KELUARGA_DASAR (subsetTugas.ts:331)  → konstan, termasuk 'navigasi-kode' (:347)
   │     ├─ RUMAH (subsetTugas.ts:386)           → 'navigasi-kode' => [lsp_definition, lsp_symbols, lsp_references, lsp_diagnostics] (:402)
   │     └─ tambahanKelas() (subsetTugas.ts:~470) → 'web'/'panel' → browser_nav, web_search, browser_list
   └─ BATAS_TOOL_TUGAS = 20  (subsetTugas.ts:61; ditegakkan :638, :668, :680)
```

- **`web_fetch`** ada di `TOOL_DIKIRIM_SELALU` (`catalog.ts:620`) → selalu ikut ke provider; juga di
  `TOOL_BY_NAME` (`catalog.ts:365`) sehingga bisa di-resolve lewat `tool_call`.
- **`zephyr_kode`**: grep di seluruh `src/**` (di luar definisinya sendiri) = **NOL**. Tidak di `TOOL_CATALOG`,
  tidak di `KELUARGA_TOOL` (subsetTugas.ts:107), tidak di `RUMAH` (:386), tidak di subset mana pun.
  → **rantai impor = NOL importer.** Model tidak bisa memanggilnya, sekarang maupun lewat `tool_call`.
- **`ambilWeb.ts`**: grep `ambilWeb|periksaUrlAmbilWeb|saringRahasiaWeb` di luar sumbernya = **NOL importer**.

### Catatan penting — harness lama SALAH SASARAN
`scripts/uji-kesiapan-tool.mjs` mengukur **`subsetAlat.alatUntukTugas`** (`subsetAlat.ts:181-204`), yaitu **fungsi LAMA
tanpa cap**. Jalur kirim sesungguhnya adalah **`pilihToolTugas`** (`subsetTugas.ts:743`, cap ≤20). Mengukur
`alatUntukTugas` menjawab pertanyaan yang salah. `uji-jangkauan-tool.mjs` mengukur `pilihToolTugas`/`jejakPemilihan`.
Kontrol negatifnya: `zephyr_kode` juga **tidak** ada di `alatUntukTugas` (jalur lama) — jadi bolongnya di dua jalur.

---

## 4. Uji negatif

### 4a. Baca-kode — gerbang `bolehDibacaKode` / `bacaBerkasKode` (`bacaKode.ts`) — **TERBUKTI tanpa app**

Semua kasus berikut **DITOLAK** oleh gerbang (dijalankan via bundel node asli):

| Kasus | Input | Hasil |
|---|---|---|
| Path traversal | `../etc/passwd`, `../../secret.ts`, `src/../../x.ts` | DITOLAK |
| Jalur absolut luar repo | `/etc/hosts`, `C:/Windows/win.ini`, UNC `\\srv\share\a.ts` | DITOLAK |
| Berkas rahasia | `.env`, `config/.env.local`, `server.pem`, `id_rsa`, `tls.key`, `.ssh/id_rsa`, `.git/config` | DITOLAK |
| Folder user di luar repo | realpath berkas jatuh **di luar akar** repo | DITOLAK (`/KELUAR akar/`) |
| Berkas normal di repo | `src/lib/bacaKode.ts`, `README.md` | DITERIMA |

Tambahan yang dibuktikan harness:
- jembatan disk **tidak disentuh** saat berkas ditolak (`sentuh === 0` dan `jejak.length === 0`);
- **KONTROL positif** end-to-end: `bacaBerkasKode()` dengan jembatan palsu membaca berkas **nyata** offline → `ok: true`,
  `jejak` memuat `fsRead`.

### 4b. Ambil-web — kebijakan `gerbangIsiKonten` + jalur produk `web_fetch` — **kebijakan TERBUKTI tanpa app, eksekutor BUTUH APP**

Kebijakan diuji lewat fungsi node-murni `gerbangIsiKonten` (`kebijakanIsiWeb.ts:238`) — **fungsi yang sama**
yang dipanggil `web.ts` di `:463`, `:706`, `:803`, `:839`. Jadi hasil di bawah adalah perilaku jalur produk.

| Uji | Harapan | Hasil |
|---|---|---|
| skema `file:` / `javascript:` / `data:` | ditolak | DITOLAK |
| host di luar allowlist | ditolak | DITOLAK |
| `localhost` / `127.0.0.1` / `10.x` / `192.168.x` | ditolak | DITOLAK |
| metadata cloud `169.254.169.254` | ditolak | DITOLAK |
| port tak lazim (`:8080`) | ditolak | DITOLAK |
| izin OFF | **gagal-tertutup** (tolak semua) | DITOLAK SEMUA |
| kontrol `https` di allowlist | diizinkan | DIIZINKAN |
| `ambilWeb.ambilWeb` dengan `SKEMA_IZIN=https:` + `http://` | ditolak | DITOLAK (modul ini menegakkan https) |
| URL ditolak | transport **tidak** dipanggil | **nol jaringan** (`transport` call = 0) |
| isi `application/json` | bisa dibaca langsung | `ok:true`, `json:true`, `data` ter-urai |
| nol shell | tak ada `child_process`/exec/spawn | tak ada (dicek sintaks impor, bukan kata di komentar) |

> **Catatan jujur:** `web_fetch` (jalur produk yang HIDUP) **tidak** memaksa https — lihat §6. Modul `ambilWeb`
> yang menegakkan `SKEMA_IZIN=https:` justru **modul mati** (NOL importer). Jadi lantai https hanya ada di modul
> yang tak dipakai.

---

## 5. Batas pemotongan & skema argumen (angka nyata)

- Skema **`zephyr_kode`** (`bacaKode.ts:680`): properti `berkas`, `dari`, `sampai`, `simbol`; `required: ['berkas']`.
- Skema **`web_fetch`** (`web.ts`): properti `url`, `max_chars`; `required: ['url']`.
- Pemotongan keluaran `web_fetch`: **`BATAS_KARAKTER_KELUARAN = 20000`** karakter; `max_chars` di-*clamp* ke 20000
  (`periksaBatasKarakter`); batas byte di-*clamp* ke **8 MiB** (`BATAS_BYTE_MAKS`). Semua dikutip harness dan lulus.
- `web_fetch` mengizinkan `http://` (tidak ada lantai https) — lihat usulan di `USULAN-JANGKAUAN-TOOL.md`.

---

## 6. TERBUKTI tanpa app vs BUTUH APP

| Klaim | Bisa dibuktikan TANPA app? | Cara |
|---|---|---|
| `zephyr_kode` tak ada di katalog/subset | **YA** | bundel node (`catalog`, `subsetTugas`) |
| `zephyr_kode` punya skema + eksekutor + gerbang negatif benar | **YA** | bundel node (`bacaKode`) |
| `zephyr_kode` NOL importer | **YA** | grep + rantai impor statis |
| `web_fetch` terdaftar + selalu dikirim + resolve-able | **YA (katalog/node)** | bundel `catalog` + bukti baris `web.ts` |
| `web_fetch` eksekutor jalan & kebijakan host dipatuhi | **BUTUH APP** | `web.ts` tak loadable di node (`import.meta.env.DEV`) |
| `gerbangIsiKonten` dipakai di jalur `browser_nav goto` (~`:706`) | **BUTUH APP** | bukti baris saja |

---

## 7. Cara menjalankan (deterministik)

```bash
node scripts/uji-jangkauan-tool.mjs
node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
```

Tidak butuh jaringan, app, CDP, maupun port apa pun.
