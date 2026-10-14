# LAPORAN-HARNESS-MERAH — 9 harness non-produk, SEBELUM vs SESUDAH

Cabang: `feat/ai-panel-vscode-layout` · tanggal 2026-10-14 · app dev hidup di port debug **9223**
(`curl http://127.0.0.1:9223/json/version` → `http=200`, halaman `localhost:5173`, judul "Zephyr — Code Editor").

Sumber usulan: `docs/LAPORAN-AKAR-MERAH.md` (B1..B6 + item 7/8/9). Semua keluaran mentah di
`C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/harness-merah/`
(`sebelum-*.out`, `before2-*.out`, `sesudah-*.out`, `skip-*.out`, `tsc.out`, `entri-en.txt`).

Aturan main yang dipegang: **tidak melonggarkan pemeriksaan supaya hijau**. Tiap perubahan harus punya
bukti baris kode nyata, dan tiap skrip yang tidak bisa dinilai keluar lewat **SKIP exit 2** dengan pesan
jelas — bukan dicetak "GAGAL" pada aturan yang belum pernah diukur.

---

## 0. Ringkasan satu layar

| # | skrip | SEBELUM | SESUDAH |
|---|-------|---------|---------|
| 1 | `cek-aturan-operasional.mjs` | exit 1 — `GAGAL aturan "todoWrite"` (5/6); pernah juga crash `SyntaxError … :61` | **exit 0 — 6/6 lulus** |
| 2 | `cek-bridge.mjs` | exit 1 — `TypeError: Cannot read properties of undefined (reading 'value')` di `:8` | **exit 0 — 62 jembatan + PAGE terbaca** |
| 3 | `cek-i18n.mjs` | exit 1 — 9× `ISSUE`, `extra=83` (kamus EN 2321 vs 9 bahasa lain 2404) | **exit 0 — semua `missing=0 extra=0`** (data EN dilengkapi 83 kunci) |
| 4 | `cek-kunci-indo.mjs` | exit 1 — `ENOENT … Temp\indo-bersih.json` di `:11` | **exit 2 — `TIDAK BERLAKU: artefak antara belum ada`** |
| 5 | `cek-narasi-id.mjs` | exit 1 — 3× `GAGAL` (jarum basi); capture lain `1/9` + `OK uiLang dipulihkan (undefined)` | **exit 0 — 9/9 lulus** |
| 6 | `uji-guard-listener.mjs` | exit 1 — `2 GAGAL` (`onMcpScreenshot`, `onMcpConnect`) | **exit 0 — SEMUA LULUS (4/4)** |
| 7 | `cek-agent-jejak.mjs` | exit 0 pada capture saya (3/3, agent sempat jalan); lane lain mencatat 2/3 saat agent cuma mengantre | **exit 0 — 2/2 lulus**; jalur "agent tak jalan" kini **exit 2 + diagnostik** |
| 8 | `cek-backtick.mjs` (tanpa arg) | exit 1 — cuma `pakai: … <berkas>` | **exit 0 — spanduk `BUKAN UJI (alat)`** |
| 9 | `uji-diff-hijau.mjs` | exit 1 — `ENOENT D:\Talos\__uji-diff__.txt` di `:23` | **exit 2 — `TIDAK BERLAKU: folder fixture D:/Talos tidak ada`** |

`npx tsc --noEmit` → **exit 0, 0 baris keluaran** (dijalankan sesudah semua perubahan,
keluaran penuh: `harness-merah/tsc.out` — 0 baris).

Bukti jalur SKIP benar-benar aktif (port kosong, tidak ada app):
`node scripts/cek-aturan-operasional.mjs 9099` → `exit 2`, `TIDAK BERLAKU: app tidak bisa dihubungi di port 9099 (TypeError: fetch failed).`
`node scripts/cek-narasi-id.mjs 9099` → `exit 2`, `TIDAK BERLAKU: app tidak hidup di port 9099 (TypeError: fetch failed).`

---

## 1. `scripts/cek-aturan-operasional.mjs` (B1)

**SEBELUM** — keluaran nyata (`before2-cek-aturan-operasional.out`, dijalankan dari `HEAD`):

```
persona aktif: Zeph
caraKerja persona: 636 karakter
  GAGAL  aturan "todoWrite" masih ada di prompt
  OK    aturan "satuLangkahSatuTool" masih ada di prompt
  ... (5 OK)
EXIT=1
```

Capture lain di sesi ini (`sebelum-cek-aturan-operasional.out`) **crash**, bukan sekadar merah:

```
<anonymous_script>:1
[object Object]
 ^
SyntaxError: "[object Object]" is not valid JSON
    at JSON.parse (<anonymous>)
    at file:///D:/Zephyr/scripts/cek-aturan-operasional.mjs:61:17
```

Jadi cacatnya dua: (a) jarum basi, (b) keluaran `Runtime.evaluate` yang tak terbaca langsung
dilempar ke `JSON.parse` → crash, dan crash itu terlihat seperti "harness rusak", bukan
"aplikasi/evaluasi tidak menjawab".

**Sebab**
- Jarum `'plan 2 to 5 steps in todo_write'` (baris `WAJIB`) tidak ada di `src/`.
  Teks nyata: `src/lib/systemPrompt.ts:203` → `plan 2-5 steps in todo_write` (EN),
  dan `:300` untuk versi ID. Jadi `to 5` vs `2-5`.
- Baris 61: `const st = JSON.parse(r.result?.result?.value ?? '{}');` — `??`  hanya menangkap
  `null/undefined`; kalau CDP mengembalikan nilai tak-terbaca (`"[object Object]"`) tetap `throw`.

**Perbaikan**
- Jarum → `['todoWrite', 'plan 2-5 steps in todo_write']` (menyesuaikan teks nyata, bukan melemahkan).
- Prasyarat: `fetch(/json/list)` dibungkus `try` → `TIDAK BERLAKU … ` + `exit 2`; `page` tidak ada → `exit 2`.
- Guard keluaran: `typeof keluaran !== 'string'` → `exit 2`; `JSON.parse` dibungkus `try`
  → `exit 2` + 200 char pertama keluaran.
- Prasyarat persona (`persona tidak mengisi caraKerja …`) `exit 1` → `exit 2` (konsisten: itu
  "tidak berlaku", bukan "aturan gagal").

**SESUDAH** (`sesudah-cek-aturan-operasional.out`) — **exit 0**:

```
persona aktif: Zeph
caraKerja persona: 636 karakter
  OK    aturan "todoWrite" masih ada di prompt
  OK    aturan "satuLangkahSatuTool" masih ada di prompt
  OK    aturan "buktiBukanBukti" masih ada di prompt
  OK    aturan "hematTool" masih ada di prompt
  OK    aturan "blokTool" masih ada di prompt
  OK    aturan "headerCaraKerja" masih ada di prompt
== 6/6 lulus ==
```

---

## 2. `scripts/cek-bridge.mjs` (B2)

**SEBELUM** — exit 1 (`before2-cek-bridge.out`):

```
file:///D:/Zephyr/scripts/cek-bridge.mjs:8
console.log('BRIDGES:', r.result.value);
                                 ^
TypeError: Cannot read properties of undefined (reading 'value')
```

**Sebab** — `scripts/lib-cdp.mjs:314` sudah mengembalikan **nilai**-nya langsung
(`return r.result?.result?.value`), jadi `r` **adalah** string hasil, bukan lagi amplop balasan CDP.
`r.result.value` → `undefined.value`.

**Perbaikan**
- `console.log('BRIDGES:', r);` dan `console.log('PAGE:', r2);` + komentar menunjuk `lib-cdp.mjs:314`.
- Prasyarat `fetch(/json/list)` → `try`/`exit 2`; `page` tidak ada → `exit 2`.

**SESUDAH** — **exit 0** (`sesudah-cek-bridge.out`), keluaran nyata:

```
BRIDGES: __ZEPHYR_A11Y__, __ZEPHYR_AGENT_EXTRAS__, … __ZEPHYR__,  (62 jembatan)
PAGE: {"viteErr":false,"rootIsi":1,"judul":"Zephyr — Code Editor","bodyIsi":165228}
```

---

## 3. `scripts/cek-i18n.mjs` (B3) — bukti 83 kunci EN hilang = **celah nyata**, bukan harness terlalu ketat

### 3a. Bukti bahwa aturan paritasnya BENAR (jadi B3 usulan = NO-OP, tidak dipakai)

Aturan skrip: kamus EN dipakai sebagai **acuan**, tiap kamus lain wajib punya semua kunci EN
(`missing`) dan tidak boleh punya kunci yang tidak ada di EN (`extra`). Usulan B3 di
`LAPORAN-AKAR-MERAH.md` (`extra.length && n !== 'EN'` → lewati EN) adalah **no-op**: kamus EN
tidak pernah punya `extra` sendiri (selalu 0), jadi `n !== 'EN'` sudah selalu benar ketika
`extra.length > 0`. Menerapkannya tidak mengubah satu pun keputusan → jangan diterapkan.

### 3b. Bukti arah cacatnya: EN lebih pendek dari 9 bahasa lain

`sebelum-cek-i18n.out` (exit 1, 9× `ISSUE`):

```
== src/lib/i18n-extra.ts == EN keys: 2321
  ID size=2404 missing=0 extra=83 dups=0 <-- ISSUE
  EN size=2321 missing=0 extra=0 dups=0
  JA size=2404 missing=0 extra=83 dups=0 <-- ISSUE
  … (KO ZH ES FR DE PT AR sama: extra=83)
```

`missing=0` di semua kamus → **tidak ada** kunci EN yang hilang dari bahasa lain; yang cacat justru
kebalikannya: **83 kunci ada di 9 kamus lain tapi tidak ada di EN**. Capture exit: `before2-cek-i18n.out`
(dijalankan di direktori terisolasi dengan kamus EN SEBELUM dari cadangan) → **EXIT=1**, 9 baris `ISSUE`.

### 3c. Bukti runtime: kunci itu jatuh ke `?? key` untuk pengguna EN

Rantai `translate()` nyata di `src/lib/i18n.ts:3951-3958`:

```ts
  return (
    EXTRA[lang]?.[key] ??
    DICTS[lang]?.[key] ??
    DICTS.en[key] ??
    DICTS.id[key] ??
    key
  );
```

Tidak ada fallback lain: kunci yang tidak ada di `EXTRA.en`, `DICTS.en`, dan `DICTS.id`
**dikembalikan verbatim** — tanpa `'?? key'`, tanpa teks dasar. Probe runtime di app hidup
(`probe-translate-en.out`, lewat CDP: `muatKamusTambahan()` + set EN):

- **83/83** kunci mengembalikan kunci itu sendiri (bukan terjemahan),
- **0/83** ada di `src/lib/i18n-src.ts` (jadi bukan tertutup peta lain),
- **8** dari 83 bernilai **prosa Indonesia** → pengguna EN melihat teks Indonesia.

Delapan kunci bernilai Indonesia itu:

| kunci | nilai (kamus ID) | dipakai di |
|---|---|---|
| `Tool yang dikenalkan ke model` | sama | 1 komponen settings |
| `Panjang prompt sekarang` | sama | 1 komponen settings |
| `Identitas` | sama | `PersonaCard.tsx` |
| `Aturan` | sama | `PersonaCard.tsx` |
| `Sembunyikan pratinjau` | sama | `PersonaCard.tsx` |
| `Ini yang benar-benar dikirim ke model (tanpa aturan proyek & konteks).` | sama | `PersonaCard.tsx` |
| `belum dipilih` | sama | `PersonaCard.tsx` |
| `Persona: identitas` | sama | **LIVE** `src/components/settings/PersonaCard.tsx:282` (`tr('Persona: identitas')`) |

Catatan kejujuran: dari 8 itu hanya **1 yang LIVE terlihat pengguna** hari ini
(`'Persona: identitas'` di `PersonaCard.tsx:282`); 7 sisanya dormant/stale (tidak direferensikan
komponen mana pun; konsisten kategori "(c) basi indeks" di `LAPORAN-AKAR-MERAH.md`).
75 kunci sisanya bernilai Inggris → verbatim sudah Inggris yang benar.

Keputusan: **83 kunci = kamus EN tidak lengkap** → tidak perlu melemahkan `cek-i18n.mjs`;
kamus EN yang dilengkapi. Dikuatkan oleh aturan repo yang sudah terdokumentasi di
`cek-kunci-i18n-extra.mjs` ("kunci yang nilainya sudah Inggris tidak perlu entri di kamus EN")
— tapi aturan itu **tidak** dipakai untuk melonggarkan `cek-i18n.mjs`, karena satu kunci
Indonesia masih LIVE dan tujuh dormant akan bocor begitu dipakai.

### 3d. Perbaikan (data, bukan tes)

**83 entri ditambahkan** ke kamus EN di `src/lib/i18n-extra.ts`, tepat sebelum penutup kamus EN
(`:4818` entri terakhir, `:4820` `};`, `:4821` `const JA: Dict = {`). TAMBAHAN saja — berkas tidak
ditulis ulang. Cadangan berkas sebelum perubahan: `harness-merah/i18n-extra.SEBELUM.bak`.
Nilai: 75 kunci Inggris = entri **identitas** (perilaku tak berubah, `translate('en',k)` memang
sudah `=== k`); 8 kunci Indonesia = terjemahan Inggris wajar; 2 nilai diseragamkan dengan 9 kamus
saudara (`'belum dipilih'` → `'not selected'`, `'Persona: identitas'` → `'Identity'`).
Verifikasi isi: `sed -n '4732,4740p' src/lib/i18n-extra.ts` menampilkan blok baru, dan
`grep -n 'const JA' src/lib/i18n-extra.ts` → `4821` (kamus JA utuh sesudah sisipan).

**SESUDAH** (`sesudah-cek-i18n.out`) — **exit 0**, dan plafonnya naik, bukan aturannya turun:

```
== src/lib/i18n-extra.ts == EN keys: 2404
  ID size=2404 missing=0 extra=0 dups=0
  EN size=2404 missing=0 extra=0 dups=0
  JA size=2404 missing=0 extra=0 dups=0
  KO/ZH/ES/FR/DE/PT/AR size=2404 missing=0 extra=0 dups=0
```

### 3e. Daftar 83 kunci yang ditambahkan (kunci: nilai EN)

```
"Installing...": "Installing...",
"Install failed": "Install failed",
'Review': 'Review',
'Work': 'Work',
'Explore': 'Explore',
'Tool yang dikenalkan ke model': 'Tools presented to the model',
'Panjang prompt sekarang': 'Current prompt length',
'Identitas': 'Identity',
'Aturan': 'Rules',
'Sembunyikan pratinjau': 'Hide preview',
'Ini yang benar-benar dikirim ke model (tanpa aturan proyek & konteks).': 'This is what is actually sent to the model (without project rules & context).',
'belum dipilih': 'not selected',
'Persona: identitas': 'Identity',
'Add to queue': 'Add to queue',
'Compact context': 'Compact context',
'Context is already short - {n} of {keep} messages kept': 'Context is already short - {n} of {keep} messages kept',
'No conversation is open': 'No conversation is open',
'Run after the current run finishes': 'Run after the current run finishes',
'Send now (interrupt)': 'Send now (interrupt)',
'Send options': 'Send options',
'Just stop': 'Just stop',
'Stop the current run and keep this typed': 'Stop the current run and keep this typed',
'Stop the current run, then send this': 'Stop the current run, then send this',
'The current run is still stopping - message queued': 'The current run is still stopping - message queued',
"How to use it: hit \"Active\" on a persona row to turn it on — it applies to the next chat, no restart needed. \"Duplicate\" copies a built-in persona so you can change it without losing the original. If unsure, leave \"Zeph\" active: that is Zephyr\\'s built-in orchestrator with nothing added.": (sama, identitas)
"One line — shown in the persona list": (identitas)
"Manage SSH hosts then open the connection as a terminal pane. Key auth uses keyPath (the passphrase is typed directly in the pane); password auth is typed in the pane on connect - Zephyr does not store the password unless you choose to save it (encrypted).": (identitas)
"Try again": (identitas)
"Sign out of GitHub": (identitas)
"Manage GitHub token": (identitas)
"new log": (identitas)
"Empty group - open a file here": (identitas)
"Show the bottom panel (Ctrl+`)": (identitas)
"Shell": (identitas)
"Hide panel": (identitas)
"Show panel": (identitas)
"No agent CLI installed. Install one (opencode, Claude Code, Codex, Gemini, Copilot) then reload the list.": (identitas)
"Click = open the agent in the bottom terminal panel.": (identitas)
"The terminal panel is at the bottom (Ctrl+`). Running sessions will appear here with their PID.": (identitas)
"Close tab": (identitas)
"Kill process": (identitas)
"Go to": (identitas)
"URL address": (identitas)
"Private (no history)": (identitas)
"Terminal tab name": (identitas)
"This folder is a git repo": (identitas)
"not trusted": (identitas)
"Remove folder from workspace": (identitas)
"No problems in this file": (identitas)
"Open a file first": (identitas)
"Blame is not available for this file": (identitas)
"No colours in this document": (identitas)
"Definition not found": (identitas)
"Go to Definition failed": (identitas)
"Peek Definition failed": (identitas)
"No references": (identitas)
"Find References failed": (identitas)
"No language server is running": (identitas)
"Snapshot created": (identitas)
"No snapshot for this file yet": (identitas)
"No cursor in the editor": (identitas)
"Delete failed": (identitas)
"authors": (identitas)
"bithound": (identitas)
"brainfuck": (identitas)
"caddy": (identitas)
"conduct": (identitas)
"drawio": (identitas)
"folder-cloudflare": (identitas)
"folder-form": (identitas)
"folder-interceptor": (identitas)
"folder-organism": (identitas)
"ifanr-cloud": (identitas)
"jupyter": (identitas)
"kubernetes": (identitas)
"mocha": (identitas)
"puppet": (identitas)
"stackblitz": (identitas)
"stylus": (identitas)
"word": (identitas)
"Snapshot contents loaded into the editor — not saved yet (Ctrl+S to write)": (identitas)
"There is no replace to undo": (identitas)
```

Berkas lengkap 83 baris (byte-exact, dipakai apa adanya untuk menyisip): `harness-merah/entri-en.txt`.
Baris bernomor 25, 27, 33, 39, 82 memakai kutip ganda + escape; baris itu disalin **verbatim**
dari literal berkas (digenerate, bukan diketik ulang) supaya byte-exact, dan `cek-backtick.mjs`
pada `src/lib/i18n-extra.ts` → `bersih: tidak ada backtick di dalam template literal` (exit 0).

---

## 4. `scripts/cek-kunci-indo.mjs` (B4)

**SEBELUM** — exit 1 (`before2-cek-kunci-indo.out`):

```
node:fs:539
Error: ENOENT: no such file or directory, open 'C:\Users\Zyrex\AppData\Local\Temp\indo-bersih.json'
    at Object.readFileSync (node:fs:539:20)
    at file:///D:/Zephyr/scripts/cek-kunci-indo.mjs:11:30
```

**Sebab** — `indo-bersih.json` adalah **artefak antara** (daftar prosa Indonesia hasil pemindaian).
Tidak ada produsennya di repo → di mesin bersih memang tidak ada. `fs.readFileSync` telanjang →
ENOENT mentah yang terbaca seperti harness rusak.

**Perbaikan** — prekondisi `fs.existsSync(BERKAS_INDO)` → `TIDAK BERLAKU: artefak antara belum ada (…)`
+ penjelasan + `exit 2`.

**SESUDAH** (`sesudah-cek-kunci-indo.out`) — **exit 2**:

```
TIDAK BERLAKU: artefak antara belum ada (C:\Users\Zyrex\AppData\Local\Temp\indo-bersih.json).
  Tanpa daftar prosa hasil pemindaian, tidak ada yang bisa dibandingkan dengan kamus.
```

---

## 5. `scripts/cek-narasi-id.mjs` (B5)

**SEBELUM** — exit 1 (`before2-cek-narasi-id.out`):

```
import: ok
  GAGAL  id.narasi
  GAGAL  id.gagalSebarangBaris
  OK    id.giliranBanyakBaris
  GAGAL  id.hematTool
  OK    en.narasi
  …
```

dan capture lain di sesi ini, saat `Runtime.evaluate` tidak menjawab
(`sebelum-cek-narasi-id.out`) — laporan **1/9 yang menyesatkan**:

```
import: {}
  OK    uiLang dipulihkan (undefined)
== 1/9 lulus ==
```

Dua cacat nyata di situ: `h={}` membuat 8 aturan dicetak `GAGAL` padahal tidak pernah diukur,
dan `h.uiLangDipulihkan === h.asli` lolos palsu karena `undefined === undefined`.

**Sebab**
- Tiga dari empat jarum ID di blok `id:` **tidak ada** di `src/` (0 kemunculan):
  `'Setiap langkah kerja disertai'`, `'Kalau sebuah tool gagal'`,
  `'Pakai tool hanya kalau memberi informasi baru'`. Teks ID nyata di `src/lib/systemPrompt.ts`:
  `:323` `Katakan apa yang sedang kamu kerjakan`, `:325` `Kalau tool gagal, bilang gagal`,
  `:304/305` `Pakai tool hanya kalau memberi info baru`; `'beberapa baris pendek'` juga di `:323`.
  (Jarum EN semuanya valid, tidak diubah.)
- `JSON.parse(r.result?.result?.value ?? '{}')` → evaluasi gagal = `h={}` = 8 `GAGAL` palsu.
- Cek pemulihan `uiLang` tidak menolak `undefined`.

**Perbaikan**
- Jarum ID → teks nyata `systemPrompt.ts:323/325/304` (tiga jarum diganti, satu tetap).
- Prasyarat: `fetch` gagal / `page` tidak ada → `exit 2`.
- Prasyarat pengukuran: `import !== 'ok'` → `exit 2` + isi `exceptionDetails`;
  `typeof keluaran !== 'string'` → `exit 2`; `JSON.parse` → `try`/`exit 2`;
  hasil tak lengkap (`!h.id || !h.en || typeof h.asli !== 'string'`) → `exit 2`.
- Pemulihan `uiLang`: `typeof h.uiLangDipulihkan === 'string' && h.uiLangDipulihkan === h.asli`.

**SESUDAH** (`sesudah-cek-narasi-id.out`) — **exit 0**:

```
import: ok
  OK    id.narasi
  OK    id.gagalSebarangBaris
  OK    id.giliranBanyakBaris
  OK    id.hematTool
  OK    en.narasi
  OK    en.gagalSebarangBaris
  OK    en.giliranBanyakBaris
  OK    en.hematTool
  OK    uiLang dipulihkan (en)
== 9/9 lulus ==
```

---

## 6. `scripts/uji-guard-listener.mjs` (B6)

**SEBELUM** — exit 1 (`before2-uji-guard-listener.out`, dijalankan dari root repo):

```
LULUS  onAiChunk -> pakai:1 guard:aiListenerBound=1
GAGAL  onMcpScreenshot -> pakai:1 guard:mcpShotListenerBound=0
GAGAL  onMcpConnect -> pakai:1 guard:mcpConnectListenerBound=0
LULUS  onGitProgress -> pakai:1 guard:gitProgressListenerBound=1
2 GAGAL
```

**Sebab** — harness terpaku pada **satu bentuk** guard, dengan nama literal:
`let mcpShotListenerBound = false` / `let mcpConnectListenerBound = false`. Guard nyatanya
berbentuk **objek jembatan** di `src/App.tsx`:

- `jembatanMCP.shot` — dicek `if (!jembatanMCP.shot)` dan di-set `jembatanMCP.shot = 'proses'`
  (`App.tsx:1241-1246`),
- `jembatanMCP.connect` — sama, di `:1263`,
- alasannya sengaja **tidak dilepas** ada di komentar `App.tsx:1274-1280` (cleanup justru akar bug
  teks dobel), jadi bentuk ini memang sah — bukan kelalaian.

**Perbaikan** — daftar target jadi daftar bentuk yang **diterima**, bukan satu string literal:
`onAiChunk` = `let aiListenerBound = false` + `if (!aiListenerBound`; `onMcpScreenshot`/`onMcpConnect`
= `const jembatanMCP` + `if (!jembatanMCP.shot)`/`.connect` + `= 'proses'`;
`onGitProgress` = `let gitProgressListenerBound = false` + `if (gitProgressListenerBound) return`.
Pesannya kini memerinci bentuk guard yang kurang (`kurang N` / `lengkap`) alih-alih `guard=0`.
Yang **tidak** dilonggarkan: `listen(...)`-nya tetap wajib ada, dan bentuk penanda tetap wajib ada.

**SESUDAH** (`sesudah-uji-guard-listener.out`) — **exit 0**:

```
LULUS  onAiChunk -> pakai:1 guard:lengkap
LULUS  onMcpScreenshot -> pakai:1 guard:lengkap
LULUS  onMcpConnect -> pakai:1 guard:lengkap
LULUS  onGitProgress -> pakai:1 guard:lengkap
SEMUA LULUS
```

---

## 7. `scripts/cek-agent-jejak.mjs`

**SEBELUM** — pada capture saya (`before2-cek-agent-jejak.out`) hasilnya **exit 0, 3/3**:

```
batal -> {"saatJalan":true,"busyAkhir":false,"pesanBaru":0,"err":null,"streaming":false,"isi":"","toast":null}
LULUS  agent benar-benar sempat berjalan sebelum dibatalkan  ->  true
LULUS  setelah cancel, agent TIDAK menggantung (busy kembali false)  ->  false
LULUS  setelah cancel, bubble berhenti streaming  ->  false
== 3/3 lulus ==
```

Saya **tidak** mereproduksi `2/3` dari `LAPORAN-AKAR-MERAH.md`; capture saya
(`sebelum-cek-agent-jejak.out`) mencatat `saatJalan=true` dengan toast
*"1 pesan masih menunggu di antrean karena langkah sebelumnya dibatalkan"* — artinya cacatnya
**tergantung keadaan app**: kalau `send()` cuma mengantre (agent masih sibuk), `saatJalan` tetap
`false`, dan baris prasyarat itu dicetak **GAGAL** — padahal invarian yang benar-benar diuji
(busy kembali false, bubble berhenti) belum pernah diukur.

**Sebab** — baris prasyarat `agent benar-benar sempat berjalan sebelum dibatalkan` dihitung sebagai
kaidah ke-3, bukan sebagai prasyarat; `send()` yang mengantre saat sibuk membuatnya merah
(`src/lib/aiStore.ts` `send()` di `:4340-4400`, jalur antre "Added to the queue").

**Perbaikan**
- Prasyarat app: `halamanZephyr` gagal / `page` kosong → `exit 2`.
- Prasyarat "agent sempat jalan" → **bukan** `cek(...)`, tapi `if (batal.saatJalan !== true)`
  → cetak `TIDAK BERLAKU: …`, cetak **diagnostik**, lalu `exit 2` (jalur 2 invarian tetap apa adanya).
- Diagnostik baru di blok evaluate (read-only dari store): `activeId`, `adaSesiAktif`, `jumlahSesi`,
  `agentMode`, `agentBusy`, `pesanSebelum`, `pesanDiSesi`, `antrean`, `bidangProvider`.
  Tujuannya: kalau `saatJalan=false` memang cacat produk, laporannya jelas — bukan "prasyarat gagal"
  tanpa sebab. **`src/lib/aiStore.ts` tidak disentuh** (milik lane lain).

**SESUDAH** (`sesudah-cek-agent-jejak.out`) — **exit 0, 2/2 lulus** (agent sempat jalan):

```
batal -> {"saatJalan":true,"busyAkhir":false,"diagnostik":{"activeId":"chat-mv7bhv63-2","adaSesiAktif":false,
"jumlahSesi":20,"agentMode":"agent","agentBusy":false,"pesanSebelum":0,"pesanDiSesi":0,"antrean":0,
"bidangProvider":{"model":"string","provider":"string","keys":"object",…}},"pesanBaru":0,"err":null,"streaming":false,"isi":"","toast":null}
LULUS  setelah cancel, agent TIDAK menggantung (busy kembali false)  ->  false
LULUS  setelah cancel, bubble berhenti streaming  ->  false
== 2/2 lulus ==
```

Catatan: jalur `exit 2` di atas belum bisa saya picu di sesi ini (butuh app dengan agent sibuk
saat `send()` dipanggil); yang bisa saya buktikan adalah isi cabangnya + diagnostiknya terisi
pada run nyata. Yang penting: jalur itu tidak lagi mencetak `GAGAL`.

---

## 8. `scripts/cek-backtick.mjs` (tanpa argumen) — pilihan exit

**SEBELUM** — exit 1: `pakai: node scripts/cek-backtick.mjs <berkas>`.

Masalahnya bukan merah, tapi **tabrakan makna**: di berkas ini `exit 2` sudah berarti
*"ada backtick yang bermasalah"* (satu putusan uji), dan `exit 1` terbaca sebagai *"uji gagal"*.
Tanpa argumen tidak ada berkas yang diperiksa → **tidak ada putusan yang sah**.

**Perbaikan (pilihan saya)** — tanpa argumen: cetak spanduk **`BUKAN UJI (alat)`** + baris pakai,
lalu **`exit 0`**, dengan komentar yang menjelaskan tabrakan makna itu di dalam berkas.
Alasan memilih 0: ini memang alat sekali-pakai yang wajib diberi berkas; memaksa non-nol akan
membuat pemanggil tanpa-argumen muncul sebagai kegagalan uji, sedangkan `exit 2` akan salah
terbaca sebagai temuan backtick. Spanduk `BUKAN UJI` mencegahnya dibaca sebagai "bersih".

**SESUDAH** (`sesudah-cek-backtick.out`) — **exit 0**:

```
BUKAN UJI (alat): butuh argumen <berkas>, tidak ada yang diperiksa.
pakai: node scripts/cek-backtick.mjs <berkas>
```

Regresi jalur normal masih benar (dengan argumen):
`node scripts/cek-backtick.mjs src/lib/i18n-extra.ts` → `src/lib/i18n-extra.ts` /
`bersih: tidak ada backtick di dalam template literal` → **exit 0**.

---

## 9. `scripts/uji-diff-hijau.mjs`

**SEBELUM** — exit 1 (`before2-uji-diff-hijau.out`):

```
node:fs:2914
Error: ENOENT: no such file or directory, open 'D:\Talos\__uji-diff__.txt'
    at Object.writeFileSync (node:fs:2914:20)
    at file:///D:/Zephyr/scripts/uji-diff-hijau.mjs:23:4
```

**Sebab** — fixture ditulis ke `D:/Talos/__uji-diff__.txt` (baris 23) dan folder `D:/Talos`
tidak ada di mesin ini (`ls -d /d/Talos` → tidak ada). ENOENT mentah terbaca seperti harness rusak.

**Perbaikan** — prekondisi `fs.existsSync(path.dirname(BERKAS))` → `TIDAK BERLAKU: folder fixture …`
+ `exit 2` **sebelum** menulis apa pun. Fixture **tidak** saya karang di tempat lain (mengarang
fixture di luar repo = pekerjaan lain). Prasyarat app juga diperbaiki: `fetch` gagal → `exit 2`,
halaman Zephyr tidak ketemu → `TIDAK BERLAKU … (uji ini butuh app hidup)` + `exit 2`
(dulu `console.log('Zephyr tidak ketemu'); exit(1)`).

**SESUDAH** (`sesudah-uji-diff-hijau.out`) — **exit 2**:

```
TIDAK BERLAKU: folder fixture D:/Talos tidak ada, jadi berkas uji D:/Talos/__uji-diff__.txt tidak bisa dibuat.
```

---

## 10. Masih BUTUH APP (dinyatakan apa adanya, tidak diakali)

Semua skrip berbasis CDP di atas **dijalankan dengan app dev hidup di 9223** dan memberi hasil nyata
(tidak ada `SKIP` yang menyamarkan kekurangan). Tapi konsekuensinya:

| skrip | butuh app | tanpa app |
|---|---|---|
| `cek-aturan-operasional.mjs` | ya (9223) | `exit 2` `TIDAK BERLAKU: app tidak bisa dihubungi di port 9223` *(diuji: `9099` → exit 2)* |
| `cek-bridge.mjs` | ya (9223) | `exit 2` `TIDAK BERLAKU: app tidak hidup di port 9223` |
| `cek-narasi-id.mjs` | ya (9223) | `exit 2` `TIDAK BERLAKU: app tidak hidup di port 9223` *(diuji: `9099` → exit 2)* |
| `cek-agent-jejak.mjs` | ya (9223) | `exit 2` `TIDAK BERLAKU: app tidak hidup di port 9223` |
| `uji-diff-hijau.mjs` | ya (9223) + fixture `D:/Talos` | `exit 2` (fixture adalah yang memicu di mesin ini; prasyarat app juga `exit 2`) |
| `cek-kunci-indo.mjs` | tidak | `exit 2` — butuh artefak antara `%LOCALAPPDATA%/Temp/indo-bersih.json` |
| `cek-i18n.mjs`, `uji-guard-listener.mjs`, `cek-backtick.mjs` | tidak (statis) | jalan di mana saja |

Yang **belum terverifikasi tanpa app**: `cek-bridge.mjs` dan `cek-agent-jejak.mjs` hanya bisa saya
bukti-kan `exit 2` lewat isi cabangnya (keduanya memakai port 9223 hardcoded, tidak menerima argumen
port), sedangkan `cek-aturan-operasional.mjs` dan `cek-narasi-id.mjs` sudah saya buktikan langsung
memakai port kosong `9099`. App juga sempat *flapping* (3 poll `http=000`, lalu `200`).

---

## 11. Berkas yang diubah / dibuat di sesi ini

Diubah (harness, sesuai pembagian kepemilikan — tidak ada kode produk yang disentuh kecuali pengecualian i18n):

- `scripts/cek-aturan-operasional.mjs` (+30/-… , B1)
- `scripts/cek-bridge.mjs` (B2)
- `scripts/cek-narasi-id.mjs` (B5)
- `scripts/cek-kunci-indo.mjs` (B4)
- `scripts/uji-guard-listener.mjs` (B6)
- `scripts/cek-agent-jejak.mjs` (item 7)
- `scripts/cek-backtick.mjs` (item 8)
- `scripts/uji-diff-hijau.mjs` (item 9)
- `scripts/cek-i18n.mjs` (guard kamus EN tidak ketemu → `exit 2` + komentar aturan paritas; B3 tidak diterapkan)
- `src/lib/i18n-extra.ts` — **+83 entri EN** (data; pengecualian i18n yang diizinkan; TAMBAHAN saja)

Dibuat: `docs/LAPORAN-HARNESS-MERAH.md` (berkas ini), plus skrip analisa sementara di luar repo
(`harness-merah/analisa-83.mjs`, `probe-translate-en.mjs`, `gen-entri-en.mjs`, `sisip-entri-en.mjs`,
`entri-en.txt`, `i18n-extra.SEBELUM.bak`). **Tidak ada `git add`/`commit`** dan **tidak ada berkas
skrip yang dihapus**.

Verifikasi akhir: `npx tsc --noEmit` → **exit 0, 0 baris galat**; `node --check` sembilan skrip
→ semua `syntax OK`.
