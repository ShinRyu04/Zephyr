# Laporan Beban Raksasa & Argumen Malformed

Dua harness deterministik (tanpa jaringan, tanpa app, tanpa CDP) untuk menutup dua item lama:
**LAMA-besar** (tugas 40+ berkas) dan **LAMA-merah** (repro error `tool call X returned malformed JSON arguments`).

| | |
|---|---|
| Berkas harness | `scripts/uji-beban-raksasa.mjs` (16 kasus), `scripts/uji-malformed-args.mjs` (23 kasus: 4 lapis A + 5 lapis B/M + 14 bentuk cacat) |
| Cara jalan | `node scripts/uji-beban-raksasa.mjs --berkas=44 --json=scratch/uji-beban-raksasa.json` · `node scripts/uji-malformed-args.mjs --json=scratch/uji-malformed-args.json` |
| Sumber yang dipakai | dibundel apa adanya dari `src/lib/*.ts` (esbuild) dan dieksekusi/dibaca dari `src-tauri/src/adapters/openai.rs` — **bukan salinan** |
| Jaringan / app / CDP | tidak ada satu pun |
| `tsc` | `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` → **exit 0, 0 baris keluaran (0 galat)** |
| Status | 39 LULUS · 0 GAGAL · 4 TEMUAN |

---

## 1. LAMA-besar — tugas 44 berkas: VONIS **TERTUTUP (inti)**, satu penyebab terbuka

### 1.1 Keluaran nyata harness (`--berkas=44`)

```
=== UJI BEBAN RAKSASA — tugas 44 berkas (40+) ===
kode asli dibundel dari src/lib/*.ts; jendela model=128.000 token (lantai fallback), batas padat=102.400 token
PAYLOAD_MAX_CHARS=40.000 char; reserveTools=16.749 char; capUntukPesan=23.251 char; systemPromptFor=23.657 char

LULUS  B1-inti — faktaInti()=6.986 char / 1.747 token vs AMBANG_TOKEN_INTI=2.000 token (=8.000 char)
LULUS  B2-anggaran — systemPromptFor()=23.657 char (5.915 token); suntikanIndeks=846 char; spec 26 tool=14.701 char; reserveTools=16.749 char; capUntukPesan=23.251 char; PAYLOAD_MAX_CHARS=40.000; total tetap=41.252 char
LULUS  B3-suntik — suntikanIndeks('malformed JSON arguments')=846 char (0 baris entri dari 40 fakta cocok; indeks punya 6.212 entri) vs BATAS_KARAKTER_SUNTIK=1.200 char + kepala/penutup tetap (BATAS_HASIL_SUNTIK=10 entri)
LULUS  B4-cariFakta — cariFakta('malformed JSON arguments', batas=999) → 40 hasil (BATAS_HASIL_MAKS=40, bawaan=8); formatHasil=5.865 char (10 baris) vs BATAS_KARAKTER_HASIL=6.000
LULUS  B5-muat — 44/44 berkas di 44 giliran; payload/giliran awalan-akhir=27.014-27.014 char (rata-rata 24.242, puncak 5.974 token); pelanggaran anggaran=0; puncak token riwayat=73.919 vs batas padat=102.400
LULUS  B6-irama — 1.00 berkas/giliran; 44 giliran terpakai vs MAX_AGENT_STEPS=200 (sisa ruang 156 giliran, cukup untuk 156 berkas lagi)
LULUS  B7-potong — hasil tool 30.016 char → 594 char; catatan pemotongan dari kode asli=true; jumlah karakter yang hilang disebut=true; vonis di ekor ikut terbawa=true; HISTORY_TOOL_CHARS=500, HISTORY_TOOL_TAIL_RATIO=0.4
LULUS  B8-jendela — giliran terbaru tetap utuh (6.010 char); hasil tertua dipotong ke 593 char (HISTORY_TOOL_CHARS=500, HISTORY_KEEP_STEPS=6)
LULUS  B9-padat-sebelum-langgar — padat pertama di giliran 26 (sebelum=103.462 token → sesudah=27.956 token, 68 pesan diringkas); pelanggaran anggaran pertama=tidak ada; AMBANG_PADAT_TOKEN=102.400; batas dipakai=102.400
LULUS  B10-padat-mengecil — 1 pemadatan nyala; semua sesudah < sebelum=true; contoh: 103.462 → 27.956 token; RASIO_RINGKAS_TARGET=0.5
LULUS  B11-tugas-terbawa — peristiwa pemadatan dengan berkas sisa: 1 (giliran 26: 18/18 sisa terbawa di penjaga); hilang diam-diam=0; tugas belum tercatat di penjaga akhir=18 butir (PADAT_BATAS_BERKAS=20)
LULUS  B12-format-terkirim — giliran dengan riwayat dipotong: 43/44; giliran tanpa pesan=0; pesan system selalu di depan=true; giliran yang PESAN TERAKHIRNYA dipotong=43 (semuanya saat payload > cap=true, tanpa catatan pemotongan=0); contoh giliran 2: pesan tool 55→504 char, payload 24.449 > cap 23.251; payload puncak melebihi capUntukPesan sebesar 3.763 char (system prompt sendirian sudah 23.657 > cap 23.251)
LULUS  B13-determinisme — digest jalan 1 = jalan 2 = 9c22e08c3644ae08…; berkas tertulis identik=true
LULUS  B14-urutan — urutan berkas yang dikerjakan = 0…43 (44 berkas), naik-tanpa-lompat=true, duplikat=0
LULUS  B15-laporan-jujur — dipotong di 10 giliran: dilaporkan selesai 10/44, belum 34 (semua bernama: true), butir tugas belum tercatat=34; klaim "selesai semua"=false
LULUS  B16-uji-negatif — jendela dipaksa 6.000 token: pemadatan nyala=7, pelanggaran anggaran terdeteksi=0 (payload tetap di bawah PAYLOAD_MAX_CHARS karena cap char 40k, bukan token)

TEMUAN B2-reserve — systemPromptFor() (23.657 char) SUDAH melebihi capUntukPesan (23.251 char) sebelum satu pun pesan riwayat ikut; sisa anggaran untuk riwayat = 0 char. ringkasUkuran() tidak pernah menyentuh pesan system, jadi yang dikorbankan adalah riwayat.
TEMUAN B12-ekor — 43/44 giliran mengirim pesan TERAKHIR dalam bentuk terpotong (contoh giliran 2: tool 55→504 char) karena payload 24.449 melebihi cap 23.251. Catatan pemotongan ikut terkirim=true, jadi tidak ada pemotongan diam-diam — tetapi penyebabnya adalah TEMUAN B2 (system prompt 23.657 char > cap 23.251).

RINGKASAN: LULUS=16 GAGAL=0 TEMUAN=2 (18504 ms)
BEBAN NORMAL : 44/44 berkas dalam 44 giliran; puncak payload=27.014 char; pelanggaran=0; pemadatan=0; puncak token riwayat=73.919
BEBAN BERAT  : 44/44 berkas dalam 44 giliran; pemadatan nyala=1; berkas hilang diam-diam=0; puncak token riwayat=103.462
json: scratch/uji-beban-raksasa.json
```

Setelah B12 dilengkapi perekam role pesan terkirim (jalur yang sama, `--berkas=44`, 18.543 ms):

```
LULUS  B12-format-terkirim — giliran dengan riwayat dipotong: 43/44; …; contoh giliran 2: pesan tool 55→504 char (role kirim=assistant), payload 24.449 > cap 23.251; …
RINGKASAN: LULUS=16 GAGAL=0 TEMUAN=2 (18543 ms)
```

### 1.2 Bedah kejadian nyata: tugas raksasa

Yang **terbukti** (semua angka dari satu jalan deterministik, digest `9c22e08c3644ae08…` identik pada dua jalan):

- **Muat.** 44/44 berkas direncanakan dan dikerjakan dalam 44 giliran, 1 berkas/giliran. Payload tiap giliran rata-rata **24.242 char**, puncak **27.014 char** — di bawah `PAYLOAD_MAX_CHARS=40.000`; pelanggaran anggaran **0**. Ruang langkah: 44 dari `MAX_AGENT_STEPS=200`.
- **Pemadatan aktif SEBELUM anggaran dilanggar.** Pemadatan pertama di **giliran 26**, saat riwayat **103.462 token** melewati `AMBANG_PADAT_TOKEN=102.400`; sesudahnya turun ke **27.956 token** (68 pesan diringkas, target `RASIO_RINGKAS_TARGET=0.5`). Pelanggaran anggaran pada jalur normal: **tidak ada** (0). Ini jawaban langsung atas "pemadatan riwayat aktif sebelum anggaran dilanggar" — ya, dengan angka.
- **Tidak ada berkas hilang diam-diam.** Pada momen pemadatan (giliran 26) sisa **18/18 berkas** terbawa ke penjaga "tugas belum selesai"; `hilang diam-diam=0`. Di akhir, penjaga mencatat **18 butir** sisa (batas `PADAT_BATAS_BERKAS=20`).
- **Urutan deterministik.** Urutan pengerjaan 0…43, naik tanpa lompat, 0 duplikat; dua jalan penuh menghasilkan digest sama dan berkas tertulis identik.
- **Laporan akhir jujur.** Ketika beban bikin 10 giliran terpotong, laporan akhir menyebut "selesai **10/44**, belum **34**" dengan semua nama, dan klaim "selesai semua" = **false** — jadi 44 direncanakan vs berapa yang benar-benar diubah dibedakan, tidak diklaim sama.
- **Potongan (truncation) terbaca.** Hasil tool 30.016 char dipotong ke **594 char** memakai `HISTORY_TOOL_CHARS=500` + `HISTORY_TOOL_TAIL_RATIO=0.4`; catatan pemotongan berasal dari teks kode asli, menyebut jumlah karakter yang hilang, dan vonis di **ekor** hasil tetap ikut terkirim (jadi kesimpulan hasil tidak dibuang oleh pemotongan kepala).

Yang **BELUM** — dua temuan, satu akar:

- **TEMUAN B2 (akar).** `capUntukPesan = PAYLOAD_MAX_CHARS − reserveTools = 40.000 − 16.749 = 23.251 char`, sementara `systemPromptFor('id',…,'ubah 44 berkas…')` saja sudah **23.657 char** (`reserveTools=16.749` = reserve 26 spec tool yang selalu dikirim, 14.701 char + margin 2.048). Blok tetap sudah **406 char** melebihi cap sebelum satu pesan riwayat pun ikut; total tetap `23.657 + 16.749 = 40.406 char > PAYLOAD_MAX_CHARS=40.000`. `ringkasUkuran()` tidak pernah menyentuh pesan `system` (ia hanya memangkas `clone` non-system), jadi yang selalu dikorbankan adalah riwayat — tepatnya pesan terakhir.
- **TEMUAN B12-ekor (akibat).** Karena cap tak mungkin dicapai dengan memangkas riwayat, jalur pemotongan terakhir (`contextBudget.ts:297`) menyala di **43/44 giliran**: pesan terakhir yang dikirim **bukan** pesan terakhir asli (contoh giliran 2: asli role `tool` 55 char → terkirim role `assistant` 504 char). Catatan pemotongan resmi produk selalu ikut (0 kasus tanpa catatan), jadi tidak ada pemotongan diam-diam — tetapi identitas pesan terakhir berubah dan riwayat di belakangnya digerus sampai sisa 2 pesan non-system. Perlu diperiksa lanjut: mengapa elemen terakhir yang terkirim ber-role `assistant` berbeda dari elemen terakhir lokal.

### 1.3 Usulan patch untuk yang belum (berkas + baris + teks)

**(a) `src/lib/contextBudget.ts:183-189` — penjaga mati (dead guard).** Batas loop sudah mengecualikan elemen terakhir, sehingga penjaga di baris 189 tidak pernah dieksekusi; ia hanya tampak melindungi.

```
LAMA (183-189):
  for (let i = 0; i < clone.length - 1; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan. */
    if (i === clone.length - 1 && m.role === 'tool') continue;

BARU (satu dari dua, jangan keduanya):
  for (let i = 0; i < clone.length; i++) {
    … (isi 183-187 sama) …
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan. */
    if (i === clone.length - 1) continue;
  // ATAU, kalau batas loop memang mau dipertahankan: hapus baris 188-189
  // (komentar + penjaga) dan ganti komentar di atas loop menjadi
  // "Giliran terakhir dikecualikan oleh batas loop (i < clone.length - 1)".
```

**(b) `src/lib/aiStore.ts` tempat `reserveTools`/`capUntukPesan` dihitung (sekitar baris 5.930) — akar TEMUAN B2.** Angka terukur: `PAYLOAD_MAX_CHARS=40.000`, `reserveTools=16.749`, `capUntukPesan=23.251`, blok tetap `systemPromptFor=23.657`.

```
LAMA (bentuk sekarang, terukur 23.251):
  reserveTools = Math.max(20_000, PAYLOAD_MAX_CHARS - <spesifikasi tool>)
  … capUntukPesan = PAYLOAD_MAX_CHARS - reserveTools

BARU (pilih satu):
  1) Naikkan anggaran supaya cap melebihi blok tetap, dengan sisa riwayat yang nyata:
     PAYLOAD_MAX_CHARS = 48_000  →  capUntukPesan = 48.000 - 16.749 = 31.251 char
     (blok tetap 23.657 + 7.594 char riwayat ≈ 1 giliran penuh). Ambang minimum mutlak: 40.406.
  2) Sisihkan blok tetap di luar anggaran (lebih jujur secara makna):
     capUntukPesan = PAYLOAD_MAX_CHARS - reserveTools - ukuranBlokTetap
     dengan ukuranBlokTetap = panjang system prompt giliran ini.
  3) Bila keduanya tidak diinginkan: di jalur pemotongan terakhir
     (contextBudget.ts:297) JANGAN potong pesan terakhir — potong pesan
     non-system terlama berikutnya; pesan terakhir adalah data yang sedang dipakai.
```

**(c) `src-tauri/src/adapters/openai.rs` ~604-640 / ~633 — laporan galat tanpa potongan argumen.** (Lihat §2.4.)

---

## 2. LAMA-merah — argumen tool cacat: VONIS **TERTUTUP (inti)**, dua penyempurnaan terbuka

### 2.1 Keluaran nyata harness

```
=== UJI MALFORMED ARGS — agen tidak boleh mati karena argumen cacat ===
kode yang dibaca: src-tauri/src/adapters/openai.rs (tangga perbaikan, 604-) + src/lib/aiStore.ts (gerbang retry)
lapis eksekusi: cargo test --offline --lib adapters::openai → 10 lulus, 0 gagal (10 nama test terbaca)

LULUS  A1-tangga-rust — parse_argumen_tool di openai.rs:604 memuat 4 langkah perbaikan (buang_pagar_json, loloskan_kontrol, buang_koma_ujung, ambil_objek_terluar) sebelum menyerah; kalimat galat produksi berasal dari sumber: 'tool call "NAMA" returned malformed JSON arguments'
LULUS  A2-tanpa-eksekusi-setengah-jadi — openai.rs memakai '?' pada parse_argumen_tool dan 'return Err(...)' di dalam loop tool_calls: satu argumen cacat membatalkan SELURUH respons (tool_calls kosong), jadi tidak ada panggilan yang lolos dengan argumen setengah jadi
LULUS  A3-tapak-kendali-ts — aiStore.ts memuat gerbang retry: retryLimit = truncated ? 2 : 1 (baris 6098) dan bolehRetry mensyaratkan res.toolCalls.length === 0 (baris 6086)
LULUS  A4-aturan-ts — aturan malformed dibaca dari aiStore.ts:2104 (5 literal: returned malformed json arguments | arguments must be a json object | is missing arguments | is missing a function name | terpotong karena batas token); terpotong: terpotong karena batas token; pengecualian provider: 10 literal
LULUS  B1-cargo — cargo test --offline --lib adapters::openai → 10 lulus, 0 gagal (10 nama test terbaca): adapters::openai::tests::parse_tool_response_preserves_valid_tool_arguments, adapters::openai::tests::parse_tool_response_rejects_malformed_arguments, adapters::openai::tests::parse_tool_response_requires_object_arguments, adapters::openai::tests::parse_tool_response_treats_empty_arguments_as_empty_object, adapters::openai::tests::refuses_to_invent_structure_for_unterminated_arguments, adapters::openai::tests::repairs_fenced_tool_arguments, adapters::openai::tests::repairs_literal_newlines_inside_tool_arguments, adapters::openai::tests::repairs_tool_arguments_wrapped_in_prose, adapters::openai::tests::repairs_trailing_comma_in_tool_arguments, adapters::openai::tests::streamed_tool_acc_rejects_truncated_arguments
LULUS  M1-kutip-ganjil — kutip ganjil di dalam string — 'tool call "write_file" returned malformed JSON arguments' → malformed=true (harus true), terpotong=false (harus false), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M2-terpotong-batas-token — JSON terpotong karena batas token keluaran — 'tool call "write_file" terpotong karena batas token keluaran tercapai — naikkan max tokens model (isi berkas besar dikirim sebagai argumen tool)' → malformed=true (harus true), terpotong=true (harus true), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M3-terpotong-tanpa-flag — JSON terpotong tapi stream tidak melaporkan batas token — 'tool call "write_file" returned malformed JSON arguments' → malformed=true (harus true), terpotong=false (harus false), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M4-json-dalam-string — argumen dobel-encode (JSON di dalam string) — perbaikan/kosong: tidak ada kalimat galat dibuat (argumen dobel-encode (JSON di dalam string))
LULUS  M5-pagar-markdown — argumen dibungkus pagar markdown ```json — perbaikan/kosong: tidak ada kalimat galat dibuat (argumen dibungkus pagar markdown ```json)
LULUS  M6-koma-ujung — koma menggantung di ujung objek — perbaikan/kosong: tidak ada kalimat galat dibuat (koma menggantung di ujung objek)
LULUS  M7-newline-mentah — newline mentah di dalam string — perbaikan/kosong: tidak ada kalimat galat dibuat (newline mentah di dalam string)
LULUS  M8-argumen-kosong — arguments kosong ("") - bukan JSON rusak — perbaikan/kosong: tidak ada kalimat galat dibuat (arguments kosong ("") - bukan JSON rusak)
LULUS  M9-tipe-salah-array — arguments berupa array, bukan objek — 'tool call "write_file" arguments must be a JSON object' → malformed=true (harus true), terpotong=false (harus false), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M10-tanpa-arguments — field arguments tidak ada — perbaikan/kosong: tidak ada kalimat galat dibuat (field arguments tidak ada)
LULUS  M11-tanpa-nama-fungsi — nama fungsi kosong — 'tool call #0 is missing a function name' → malformed=true (harus true), terpotong=false (harus false), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M12-argumen-ganda — dua panggilan: #0 sah, #1 cacat — 'tool call "write_file" returned malformed JSON arguments' → malformed=true (harus true), terpotong=false (harus false), menyebut nama tool/index=true (harus true), ada potongan argumen salah=false
LULUS  M13-provider-429 — bukan cacat argumen: provider 429 — '429 Too Many Requests: rate limit exceeded' → jalur malformed=false (harus false), provider retryable=true (harus true): galat provider tidak boleh salah masuk ke jalur argumen, dan sebaliknya
LULUS  M14-argumen-valid — argumen sah (kontrol) — perbaikan/kosong: tidak ada kalimat galat dibuat (argumen sah (kontrol))
LULUS  M15-cakupan — 14 bentuk cacat diuji di lapis TS (kutip ganjil, terpotong, dobel-encode, pagar, koma ujung, newline, kosong, array, tanpa arguments, tanpa nama, ganda, provider 429, kontrol sah); gagal=0
LULUS  M17-pesan-ke-model — pesan-lanjutan (ID) (aiStore.ts:6250): menyertakan res.error=true, menyertakan potongan argumen=false; entri langkah (ID) (aiStore.ts:6241): menyertakan res.error=true, menyertakan potongan argumen=false; koreksiArgumenTool (EN) (aiStore.ts:6046): menyertakan res.error=false, menyertakan potongan argumen=false → nama tool sampai ke model lewat res.error pada 2/3 situs, potongan argumen mentah pada 0/3 situs
LULUS  M18-tanpa-eksekusi — blok pemulihan aiStore.ts:6232 memuat 'continue;' di 1010 char sebelum ada panggilan tool; pemanggil tool SEBELUM continue=0; sesudahnya=0 (jalur normal, bukan jalur rusak)
LULUS  M19-determinisme — digest jalan 1 = jalan 2 = 82de12706bade619…; tanpa jaringan, tanpa app, tanpa CDP

TEMUAN M16-potongan-argumen — 7/14 kalimat galat menyebut NAMA tool tetapi TIDAK memuat potongan argumen yang salah (M1-kutip-ganjil, M2-terpotong-batas-token, M3-terpotong-tanpa-flag, M9-tipe-salah-array, M11-tanpa-nama-fungsi, M12-argumen-ganda, M13-provider-429). Di openai.rs, `raw_args` hanya dipakai di baris 238, 247 - semuanya untuk parsing, bukan untuk laporan. Usulan: lihat docs/LAPORAN-BEBAN-DAN-MALFORMED.md (patch openai.rs ~633).
TEMUAN M17-potongan — ketiga pesan pemulihan menyebut nama tool (lewat res.error) tetapi TIDAK memuat potongan argumen yang salah; model harus menebak bagian mana yang rusak. Usulan patch ada di laporan.

RINGKASAN: LULUS=23 GAGAL=0 TEMUAN=2 dari 14 bentuk cacat (1960 ms)
json: scratch/uji-malformed-args.json
```

### 2.2 Bedah kejadian nyata: `tool call X returned malformed JSON arguments`

Rantai lengkap, semuanya dari kode yang dikirim:

1. **Model mengirim argumen cacat.** Stream tool-call menumpuk `raw_args`.
2. **Tangga perbaikan Rust (`openai.rs:604`, `parse_argumen_tool`)** mencoba berurutan: `buang_pagar_json` (```json … ```), `loloskan_kontrol` (newline mentah di dalam string), `buang_koma_ujung` (koma menggantung), `ambil_objek_terluar` (JSON di dalam prosa/dobel-encode) → dieksekusi nyata oleh `cargo test --offline --lib adapters::openai`: **10 lulus, 0 gagal**, termasuk `repairs_fenced_tool_arguments`, `repairs_literal_newlines_inside_tool_arguments`, `repairs_tool_arguments_wrapped_in_prose`, `repairs_trailing_comma_in_tool_arguments`, `refuses_to_invent_structure_for_unterminated_arguments`, `streamed_tool_acc_rejects_truncated_arguments`.
3. **Bila keempat langkah gagal**, produksi mengeluarkan `Err(format!("tool call \"{name}\" returned malformed JSON arguments"))` (`openai.rs` ~633) atau, kalau stream melaporkan batas token habis, `tool call "{name}" terpotong karena batas token keluaran tercapai …`. Kalau `arguments` bukan objek: `tool call "{name}" arguments must be a JSON object`; kalau nama fungsi kosong: `tool call #{index} is missing a function name`.
4. **Tidak ada eksekusi setengah jadi.** `parse_argumen_tool(raw_args, …, name)?` memakai `?` dan `return Err(...)` di dalam loop `tool_calls` → satu argumen cacat membatalkan **seluruh** respons, sehingga `toolCalls` kosong. Tidak ada panggilan tool yang lolos dengan argumen separuh; `refuses_to_invent_structure_for_unterminated_arguments` menjaga janji ini untuk kasus terpotong.
5. **Agen tidak mati, ia diberi kalimat dan boleh mengulang.** `src/lib/aiStore.ts:6086` mensyaratkan `res.toolCalls.length === 0` untuk jalur ini, dan `aiStore.ts:6098` menetapkan jatah ulang: `isTruncatedToolResponseError(res.error ?? '') ? 2 : 1` → **1 kali** untuk JSON rusak, **2 kali** untuk kasus terpotong. `aiStore.ts:6232` menuliskan kalimat ke model lalu `continue;` **1010 char sebelum** ada panggilan tool apa pun (`pemanggil tool SEBELUM continue=0`) — tidak ada tool dijalankan di jalur rusak.
6. **Klasifikasi memakai aturan asli.** Fungsi `isRetryableAgentToolResponseError` (`aiStore.ts:2104`) tidak diekspor, jadi harness membaca **literal `includes(...)` dari teks fungsi yang dikirim** dan menerapkannya ke kalimat galat di atas: 5 literal (`returned malformed json arguments`, `arguments must be a json object`, `is missing arguments`, `is missing a function name`, `terpotong karena batas token`). Hasil: semua bentuk cacat (M1-M3, M9, M11, M12) terbaca `malformed=true`; bentuk yang **diperbaiki** tangga Rust (M4-M8, M10, M14) tidak pernah memproduksi kalimat galat, jadi jalur pemulihan tidak menyala palsu.
7. **Tidak salah rute.** Error provider 429 (`'429 Too Many Requests: rate limit exceeded'`) → `malformed=false`, `provider retryable=true`. Jalur argumen dan jalur provider tidak saling menelan; 10 literal pengecualian di `isRetryableAgentProviderError` mencegah "malformed" terbaca sebagai galat provider biasa.
8. **Deterministik & tanpa jaringan.** `cargo test --offline` (memakai `target/` yang ada), nol HTTP, nol CDP; digest klasifikasi dua jalan identik (`82de12706bade619…`).

Yang **BELUM** (dua temuan, keduanya soal kualitas laporan ke model, bukan kematian agen):

- **TEMUAN M16.** 7 dari 14 kalimat galat menyebut **nama tool** tetapi **tidak memuat potongan argumen yang salah**; `raw_args` di `openai.rs` hanya dipakai di baris 238 dan 247 (parsing), tidak pernah dipakai untuk membentuk laporan. Model tahu *tool mana*, tidak tahu *bagian mana* yang rusak.
- **TEMUAN M17.** Dari 3 situs kalimat pemulihan, **2** menyertakan `res.error` (nama tool ikut sampai ke model: `aiStore.ts:6241` entri langkah, `aiStore.ts:6250` pesan lanjutan), **1 tidak**: `aiStore.ts:6046` (`The previous response had invalid tool-call arguments` — jalur EN) sehingga di situ model tidak menerima nama tool. Nol situs menyertakan potongan argumen.

### 2.3 Usulan patch untuk yang belum (berkas + baris + teks)

**(c) `src-tauri/src/adapters/openai.rs` ~633 — sertakan potongan argumen (maks 80 char, JSON-escape).**

```
LAMA (~633, terukur dari sumber):
  return Err(format!("tool call \"{name}\" returned malformed JSON arguments"));

BARU:
  let cuplik = raw_args.chars().take(80).collect::<String>();
  return Err(format!(
      "tool call \"{name}\" returned malformed JSON arguments: {cuplik}{}",
      if raw_args.chars().count() > 80 { "…" } else { "" }
  ));
```

**(d) `src/lib/aiStore.ts:6046` — jalur EN kehilangan nama tool.**

```
LAMA (6046):
  text: 'The previous response had invalid tool-call arguments. Re-issue the
         tool call with valid JSON arguments.'   (bentuk ringkas; tanpa res.error)

BARU:
  sertakan `: ${res.error}` pada kalimat itu (seperti situs 6241/6250), supaya
  nama tool dan potongan argumen dari patch (c) ikut terkirim pada jalur EN.
```

---

## 3. Vonis jujur: mana yang tertutup, mana yang belum

| Klaim | Status | Bukti |
|---|---|---|
| Rencana 40+ berkas (44) muat anggaran konteks, dengan angka per giliran | **TERTUTUP** | B5/B6: 44/44 berkas, 44 giliran, 24.242 char rata-rata, puncak 27.014 char < 40.000; 0 pelanggaran |
| Pemadatan riwayat aktif sebelum anggaran dilanggar | **TERTUTUP** | B9/B10: padat di giliran 26 pada 103.462 token (ambang 102.400) → 27.956 token; 0 pelanggaran sebelum itu |
| Tidak ada berkas hilang diam-diam tanpa catatan | **TERTUTUP** | B11: 18/18 sisa terbawa di penjaga saat pemadatan; `hilang diam-diam=0`; 18 butir di penjaga akhir |
| Urutan kerja deterministik | **TERTUTUP** | B13/B14: digest sama pada dua jalan, urutan 0…43 tanpa lompat/duplikat |
| Laporan akhir menyebut berkas yang BENAR-BENAR diubah vs direncanakan | **TERTUTUP** | B15: "selesai 10/44, belum 34" bernama, klaim "selesai semua"=false |
| Anggaran payload selalu di bawah `capUntukPesan` pada tugas besar | **BELUM** — TEMUAN B2 + B12-ekor | Blok tetap 40.406 char > `PAYLOAD_MAX_CHARS` 40.000 → cap 23.251 char tak tercapai; 43/44 giliran memotong pesan terakhir. Usulan (a)/(b) |
| Argumen tool cacat tidak mematikan agen, dilaporkan ke model, boleh ulang | **TERTUTUP** | A1-A4, B1 (10/10 cargo), M1-M19: 14 bentuk cacat, 0 gagal, retry 1×/2×, `cargo test` nyata |
| Jalur pulih tidak pernah mengeksekusi tool dengan argumen setengah jadi | **TERTUTUP** | A2 (Rust: `?` + `return Err` → `tool_calls` kosong), A3/M18 (`res.toolCalls.length === 0`, `continue;` tanpa pemanggil tool) |
| Kalimat galat menyebut **nama tool** | **TERTUTUP sebagian** | 2/3 situs TS menyertakan `res.error`; `aiStore.ts:6046` (EN) tidak → usulan (d) |
| Kalimat galat memuat **potongan argumen yang salah** | **BELUM** — TEMUAN M16/M17 | 0/14 kalimat; `raw_args` tak dipakai untuk laporan → usulan (c) |
| Jalur malformed dan jalur provider tidak salah rute | **TERTUTUP** | M13: 429 → `malformed=false`, `provider retryable=true` |

## 4. Catatan cara kerja (supaya bisa diperiksa ulang)

- Tidak ada kode produk yang diubah oleh pekerjaan ini. Berkas baru: dua harness di `scripts/` + laporan ini. Artefak jalannya di `scratch/` (`uji-beban-raksasa.json`, `uji-malformed-args.json`, `uji-malformed-args.txt`, `tsc.txt`).
- Harness 1 membundel `src/lib/*.ts` yang dikirim dengan esbuild (flag `--define:globalThis.self=globalThis` dan `--define:import.meta.env={…}`) ke `scratch/uji-beban-raksasa/entri.bundle.mjs`, lalu memakai fungsi nyata: `systemPromptFor`, `faktaInti`, `suntikanIndeks`, `cariFakta`, `formatHasil`, `agentToolSpecs`, `ringkasRiwayat`, `padatkanRiwayatMurni`, `perkiraanKonteks`, `batasAutoCompact`, `potongHasilRiwayat`, `tugasBelumSelesaiRiwayat`.
- Harness 2 tidak bisa mengimpor `isRetryableAgentToolResponseError` (tidak diekspor), jadi aturannya dibaca **dari teks fungsi yang dikirim** dan diterapkan ke kalimat galat nyata; eksekusi tingkat-kode diambil dari `cargo test --offline --lib adapters::openai` (lapis A/B), yang juga jadi bukti Repro Bersih untuk LAMA-merah.
- Semua kasus memakai angka/konstanta yang dibaca saat runtime dari kode yang dikirim; tidak ada angka yang disalin ke dalam harness.
- Determinisme: dua jalan penuh per harness, dibandingkan lewat digest SHA-256 (`9c22e08c3644ae08…` beban, `82de12706bade619…` malformed). `tsc --noEmit` → 0 galat.
