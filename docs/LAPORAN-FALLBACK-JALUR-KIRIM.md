# Laporan — jalur kirim NYATA vs tuntutan item ZEPH-PROVIDER-FALLBACK

- Repo: `D:/Zephyr`, branch `feat/ai-panel-vscode-layout`
- Tanggal ukur: 14 Okt 2026
- Harness: `scripts/uji-fallback-jalur-kirim.mjs` (baru, milik laporan ini) — **20 pemeriksaan, exit 0**
- Log mentah (temp, isi apa adanya): `%TEMP%\ujiA.log`, `%TEMP%\ujiB.log` (111 baris), `%TEMP%\tsc-fallback.log`
- Yang diukur: kode jalur kirim **asli** (`src/lib/aiStore.ts`, dibundel esbuild 9,26 MB dari sumber repo), `jalankanAgentTool` + tool tulis asli (menulis ke berkas NYATA), `pilihModelCadangan` (`src/lib/contextBudget.ts:330`), `agentStopMessage` (`src/lib/agentStop.ts`).
- `src/lib/providerTahan.ts` **tidak diuji dan tidak diimpor** harness ini — justru diperiksa sebagai tersangka modul mati (kasus `m1`).
- Nama internal kode ditulis apa adanya (bukan diparafrase) supaya bisa di-grep ulang di baris yang dikutip.

## 0. Cara menjalankan ulang (persis yang dijalankan)

```
node D:/Zephyr/scripts/uji-fallback-jalur-kirim.mjs          # 20/20, exit 0, ~11 dtk
node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr   # 0 galat, exit 0
```

Determinisme (dua jalan penuh, stempel mtime absolut disamarkan karena basis jam-palsu = waktu proses mulai):

```
diff <(sed -E 's/[0-9]{13}\.[0-9]+/MTIME/g' ujiA.log) <(sed -E 's/[0-9]{13}\.[0-9]+/MTIME/g' ujiB.log)
→ 0 baris berbeda (111 baris identik)
```

## 1. Angka hasil (bukan bacaan kode)

| Kasus | Angka terukur |
|---|---|
| `m1` pengguna `providerTahan.ts` | impor `providerTahan` = **0**, `panggilTahan` = **0**, `JendelaKredensial` = **0** di seluruh `src/` |
| `a1` pintu chat `send()` (`aiStore.ts:4356`) kena 429 | **7 percobaan**, jeda nyata antar percobaan `[1000, 2500, 4000, 12000, 22000, 0] ms`, total tunggu **41.500 ms** |
| `a2` pesan dari pintu chat | 239 karakter; SEBAB (429) = ada, TINDAKAN = ada, **daftar provider = tidak ada, nomor percobaan = tidak ada** |
| `b1` `sendAgent()` kena 429 | **7 percobaan** (bukan 3), jeda sama `[1000,2500,4000,12000,22000,0] ms` = 41.500 ms |
| `b2` pindah kandidat | model `gpt-6-astra → gpt-5.6-sol`, **provider tetap `openai`** |
| `b3` progres saat menunggu | `"Menunggu provider pulih (1/3, 4 dtk, total ~38 dtk dari ~38 dtk)"` **12×**, `"beralih ke"` **1×** — layar tidak kosong |
| `b4` pesan akhir | SEBAB = ada, TINDAKAN (`"lanjut"`) = ada; **daftar provider = false, nomor percobaan = false** |
| jeda ≥500 ms yang diminta kode | `2500ms×2`, `300000ms×1`, `360000ms×1`, `900000ms×1`; tangga retry diwujudkan lewat **830 timer polling <500 ms** (50 ms), jadi 1000/4000/12000/22000 tidak muncul sebagai nilai `setTimeout` |
| `c1` 502 (5xx) | **7 percobaan**, jeda sama, 41.500 ms — 5xx diperlakukan sama seperti 429 |
| `c2` 401 | **tepat 1 percobaan, 0 ms tunggu** — kredensial salah tidak diboroskan |
| `d1` tool tulis NYATA | `fs_write kerja-selesai.txt` benar-benar sampai ke lapisan OS; berkas 71 karakter di disk |
| `d2` setelah 7 percobaan gagal | isi **IDENTIK** (true) dan mtime **TIDAK bergeser** (stempel sama persis) |
| `d3` putar ulang tool | perintah tulis ke disk selama giliran gagal = **0** |
| `e1` kunci rahasia | canary kunci muncul **0×** dari 7 percobaan provider dan 29 panggilan IPC |
| `f1` anggaran menit | grep `JendelaKredensial` = **0**, `maksPercobaan` = **0**, `Retry-After` = **0** di `aiStore.ts`; percobaan terbanyak dalam jendela 60 dtk mana pun = **13** (plafon 70), dan itu **bukan karena dijaga** |
| `f2` pola jeda | semua **279** jeda antar percobaan persis milik tangga `{0,1000,2500,4000,12000,22000}` — tidak ada pelambatan lain |
| `f3` dua lajur `sendAgent()` sekaligus | **8 percobaan provider** dari 2 lajur (bukan 7) → percobaan **berkali** dengan jumlah lajur |
| `g1` provider tak pernah menjawab | diputus kode sendiri tepat **300.000 ms** (`AGENT_NO_PROGRESS_MS`, `aiStore.ts:2025`); pesan `Timeout: Provider berhenti menjawab…` |
| `g2` provider menjawab potongan tiap 120 dtk | tetap diputus pada **420.000 ms**; batas keras **900.000 ms** (`aiStore.ts:2042`) dipasang tapi **tidak pernah tercapai** |
| `h1` `pilihModelCadangan()` | kunci hanya `openai` → `{provider: openai, id: gpt-5.6-sol, alasan: " (provider sama)"}`; kunci `openai`+`anthropic` → **tetap model yang sama**; provider freeText milik user (`custom`) → **`null`** (nol jalur fallback) |
| `i1` determinisme | dua jalan penuh identik (jejak/jeda/pesan); diff penuh = 0 baris |

## 2. Tabel tuntutan item → bukti

| # | Tuntutan item | Vonis | Angka | Bukti berkas:baris |
|---|---|---|---|---|
| a | 429 → **tunggu** lalu pindah kandidat, bukan menyerah di percobaan ke-3 | **ADA (sebagian)** | 7 percobaan, tangga 1.000/2.500 lalu tunggu-pulih 4.000/12.000/22.000 = 41.500 ms per giliran; **tanpa** `Retry-After`, **tanpa** anggaran menit | `aiStore.ts:2101` (`AGENT_PROVIDER_RETRY_DELAYS`), `:2203` (`TUNGGU_PULIH_DELAYS`), pemakaian `:6206`; terukur `b1` |
| a′ | jalur yang benar-benar dilewati pintu chat | **temuan** | pintu chat `send()` (`:4356`) **langsung masuk tangga agent** — `RETRY_CHAT=[1200,3000]` (`:4915`) bukan yang jalan lebih dulu | `a1` |
| b | fallback **antar-model/provider** | **ADA (sebagian)** | 1× pindah model per giliran, **provider tetap** (`(provider sama)`); provider freeText user: **nol** cadangan; walau kunci provider lain tersedia, tetap model provider yang sama | `contextBudget.ts:330`; pemakaian `aiStore.ts:6146`; terukur `b2`, `h1` |
| c | batas waktu per giliran | **ADA** | 3 lapis: tanpa-progres **300.000 ms** (`:2025`) dan idle **360.000 ms** (`:1996`, disetel ulang hanya oleh potongan berisi `:8005/:8012/:8029`), batas keras **900.000 ms** (`:2042`, tidak pernah disetel ulang). Terukur: `g1` diputus 300.000 ms; `g2` diputus 420.000 ms; **batas keras 900.000 ms tidak terjangkau** | `g1`, `g2` |
| d | pesan ke user memuat SEBAB + provider mana saja + NOMOR percobaan + satu tindakan | **SEBAGIAN** | SEBAB (429/401) ada, satu TINDAKAN (`"lanjut"`) ada, **daftar provider dan nomor percobaan TIDAK ada** — di pintu chat maupun di agent | pembentuk pesan `aiStore.ts:7284` + template `:7322`; terukur `a2`, `b4` |
| e | kerja yang sudah di disk tidak hilang | **TERBUKTI** | tool tulis NYATA berjalan (71 byte di disk); setelah 7 percobaan gagal: isi identik, mtime tidak bergeser, 0 tulis ulang | `d1`, `d2`, `d3` |
| e′ | percobaan ulang tidak mengirim ulang kunci | **TERBUKTI** | kunci muncul **0×** dari 7 percobaan provider + 29 panggilan IPC | `e1` |
| f | laju ≤ 60 sukses / 70 percobaan per 60 dtk | **TIDAK ADA KODENYA** | 3 grep = 0; percobaan terbanyak/jendela = 13 (di bawah plafon **karena tangga 41,5 dtk mengunci laju**, bukan karena dijaga); lajur kedua menembak tanpa penjaga (8 percobaan dari 2 lajur) | `f1`, `f2`, `f3` |
| g | determinisme 2× jalan | **TERBUKTI** | 111 baris identik; 20/20 hasil sama dua jalan; exit 0 | `i1` + diff tersamar = 0 baris |

## 3. Vonis `providerTahan.ts` — MODUL MATI (kembar, nol pengguna)

Perintah & keluaran apa adanya:

```
grep -rn "providerTahan" src/ --include=*.ts --include=*.tsx | grep -v "^src/lib/providerTahan.ts:" | wc -l
→ 0
grep -rln "providerTahan" --include=*.ts --include=*.tsx --include=*.mjs --include=*.js . | grep -v node_modules
→ ./scratch/probe/entry2.bundle.mjs, ./scratch/probe/entry2.mjs,
  ./scripts/uji-fallback-jalur-kirim.mjs, ./scripts/uji-provider-fallback.mjs, ./src/lib/providerTahan.ts
grep -c -e "panggilTahan" -e "JendelaKredensial" -e "maksPercobaan" -e "JENDELA_PROVIDER" -e "pesanGagal" src/lib/aiStore.ts
→ 0
```

- `913 baris / 37.107 B`; satu-satunya pemakai = **harness ujinya sendiri** (`scripts/uji-provider-fallback.mjs`, 1.105 baris) dan **berkas probe di `scratch/`**. **Nol** pemakai di `src/`.
- Karena itu **41/41 hijau** di harness modul itu tidak membuktikan satu pun perilaku jalur kirim nyata (pernyataan yang sama sudah ada di `docs/LAPORAN-PROVIDER-FALLBACK.md`; di sini dibuktikan lewat `m1`).
- Isi modul itu justru **tepat barang yang hilang** di jalur nyata: `JENDELA_PROVIDER = {detik: 60, maksPercobaan: 70, maksSukses: 60}` (`:504`), `anggaranPercobaan: 8`, `maksPercobaanPerKandidat: 3`, `batasGiliranMs: 120_000`, `batasPercobaanMs: 45_000` (`:119-145`), `Retry-After` (`bacaSetelahHeader :428`), `saringRahasia :338`, dan `pesanGagal :512` yang sudah memuat **N percobaan + daftar kandidat + satu tindakan**.

## 4. Temuan sampingan (perlu dicatat, bukan tuntutan item)

1. **Komentar usang vs konstanta**: komentar di `aiStore.ts:6123-6127` menyebut "jeda bertingkat (15s, 30s, 60s) … Total ~105 detik", sedangkan kode yang jalan `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]` (`:2203`) = **38 dtk** (terukur: teks progres `total ~38 dtk` dan total nyata 41.500 ms termasuk 3.500 ms tangga cepat).
2. **"3 percobaan" milik insiden**: `retryLimit = AGENT_PROVIDER_RETRY_DELAYS.length` (`:6096-6099`) = **3 percobaan per ronde tangga** — jadi klaim "menyerah di percobaan ke-3" benar untuk **satu ronde**, tetapi jalur nyata **tidak berhenti** di situ (ronde tunggu-pulih + 1× pindah model menyusul → 7 percobaan). String provider `"rate-limited every one of 3 attempts"` **tidak ditemukan** di `src/` maupun `src-tauri/src` (`grep -rn -e "every one of" -e "rate-limited every"` → hanya komentar tak berkaitan), jadi pesan itu datang dari lapisan di luar repo ini atau dari harness subagent, bukan dari `aiStore.ts`.
3. **Jalur 401 sudah benar**: 1 percobaan, 0 ms tunggu (`c2`) — regex `:2124` memuat `401|403|400|404` sebagai **tidak boleh diulang** sebelum daftar kode yang boleh.
4. **Laju berkali dengan lajur** (`f3`): dua `sendAgent()` berturut-turut memicu 8 percobaan provider. Ini bentuk nyata "429 membunuh beberapa anak": tidak ada penjaga laju di jalur store, jadi makin banyak lajur → makin banyak percobaan/menit.
5. **Batas keras 15 menit praktis mati** (`g2`): penjaga 300.000/360.000 ms selalu menembak lebih dulu; batas 900.000 ms dipasang dan tidak pernah disetel ulang (`:2030-2043`), tetapi tidak tercapai pada pola uji mana pun.
6. **Tidak ada anggaran waktu per-giliran** di jalur nyata: yang ada adalah penjaga **per-langkah**. `panggilTahan` punya `batasGiliranMs` — sekali lagi hanya di modul mati.

## 5. Batas kejujuran harness (yang TIDAK bisa diklaim)

- Jalur **streaming live** (Tauri `Channel` untuk `ai_tool_chat_stream`) dipotong di batas IPC: `__TAURI_INTERNALS__.invoke` diganti router palsu; jadi yang diuji adalah logika retry/fallback/pesan, bukan penguraian frame Rust.
- `jalankanAgentTool('write_file')` **melempar** setelah menulis (`ERROR: Cannot read properties of undefined (reading 'split')` di `galatToolUntukModel`) karena args harness kurang lengkap. Bukti (d) tetap sah karena perintah `fs_write` benar-benar sampai ke lapisan OS dan berkasnya ada di disk dengan 71 byte — dicatat apa adanya di log, baris 49-52.
- Stempel **mtime absolut** berbeda antar jalan (basis jam-palsu = waktu proses mulai); yang dibuktikan adalah **mtime tidak bergeser di dalam satu giliran**, bukan nilai kalendernya.
- Subagent/anak delegasi (kejadian nyata: 2 dari 4 anak delegasi mati) **tidak** diuji: harness ini satu proses, tanpa orkestrasi anak. Yang bisa diklaim: laju percobaan berkali dengan lajur (`f3`).
- 10 perintah Tauri yang tidak dipalsukan **dilempar, bukan dikarang** (tercatat di log: `get_public_models, fs_read, agent_context, get_app_info, list_workspace_files, workspace_info, extensions_manifests, memory_read, instructions_list, fs_exists`) — jadi tidak ada respons palsu yang bisa menyamarkan perilaku.

## 6. Kesimpulan (ringkas)

Jalur kirim nyata **sudah** melakukan retry+backoff nyata (7 percobaan, 41,5 dtk, 429 **dan** 5xx), **sudah** pindah kandidat satu kali, **sudah** memutus giliran yang menggantung (300 dtk), **sudah** memakai pesan yang tidak bohong, dan **terbukti** tidak menghapus kerja di disk maupun mengirim ulang kunci. Yang **belum** ada: (1) plafon laju per-menit/`Retry-After` — nol kode; (2) fallback **antar-provider** (hanya antar-model di provider yang sama); (3) nomor percobaan + daftar provider di pesan akhir; (4) anggaran waktu **per-giliran**; (5) penjaga laju antar-lajur. Tiga dari lima itu sudah ditulis & diuji di `providerTahan.ts` — lihat `docs/USULAN-FALLBACK-JALUR-KIRIM.md` untuk satu rekomendasi tegas beserta patch-nya.
