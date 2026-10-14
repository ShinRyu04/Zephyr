# LAPORAN PATCH ANGGARAN PESAN & ARGUMEN TOOL

Lane: `lama-besar-patch-anggaran` + `lama-merah-patch-argumen` (satu lane, berkas sama).
Berkas yang disentuh (semuanya milik lane ini):

| berkas | peran |
|---|---|
| `src/lib/contextBudget.ts` | Patch #1 (penjaga mati) |
| `src/lib/aiStore.ts` | Patch #2, #3, #4 |
| `src-tauri/src/adapters/openai.rs` | Patch #5 |
| `scripts/uji-anggaran-pesan.mjs` | model produk + cacat harness D5 |
| `scripts/uji-malformed-args.mjs` | cacat harness M17/M16/T_MALFORMED |

Tidak ada berkas `src/**` lain yang disentuh. Tidak ada `git add/commit/clean`. Tidak ada harness CDP / app dijalankan.

**Angka ringkas:** puncak payload kabel **41.512 → 39.861 char** (`PAYLOAD_MAX_CHARS`=40.000, lewat batas **44/44 → 0/44** giliran). Anggaran: `LULUS=11 GAGAL=9 TEMUAN=10` → `LULUS=18 GAGAL=2 TEMUAN=4`. Malformed: `LULUS=23 GAGAL=0 TEMUAN=1`. `cargo test --lib` = **518 passed / 0 failed**. `tsc` = **exit 0**.

---

## 1. Vonis per patch

| # | Cacat | Vonis | Jenis |
|---|---|---|---|
| 1 | Penjaga mati `contextBudget.ts` (~183/189) | **TERTUTUP** — C1/C2/C3 lulus: penjaga kini terjangkau & menyala (1 kali) | cacat PRODUK |
| 2 | `reserveTools`/`capUntukPesan` tidak menutup blok tetap | **SEBAGIAN** — cap kini mengurangi blok tetap + memperingatkan, tetapi cap 20.000 **tetap tak tercapai** | cacat PRODUK, akarnya keputusan pemilik |
| 3 | Catatan status/gerbang/koreksi di LUAR anggaran (2.023 char) | **TERTUTUP, dengan koreksi angka** — usulan dok 1.200 char **tidak muat**; dipakai 240 | cacat PRODUK + koreksi angka |
| 4 | Nama tool + potongan argumen di 3 situs pesan galat | **TERTUTUP** — D1–D4/D6 lulus 3/3 | cacat PRODUK |
| 5 | `openai.rs` tidak menginterpolasi `raw_args` di galat malformed | **TERTUTUP** — D5 lulus: argumen ke-2 dicetak, dibatasi 160 char | cacat PRODUK |
| 6 | `PAYLOAD_MAX_CHARS` / batas keras | **TIDAK DISENTUH** (keputusan pemilik) — dan **terbukti diperlukan**: blok tetap 40.687 > 40.000 | keputusan pemilik |

Yang **masih GAGAL** dan tidak bisa ditutup dari sisi lane ini (bukan kemalasan, aritmetika):

```
GAGAL  A2-cap-tercapai — capUntukPesan 20.000 char < blok tetap 23.793 char: TIDAK MUNGKIN dicapai (selisih 3.793 char)
GAGAL  A4-pesan-lewat-cap — ukuranPayload(pesan) puncak=25.017 char vs capUntukPesan=20.000 char; lewat cap di 44/44 giliran
```

`capUntukPesan` sekarang `max(20.000, PAYLOAD_MAX_CHARS − reserveTools − biayaTetap)`. Dengan `PAYLOAD_MAX_CHARS=40.000`, `reserveTools=16.894` (spec tool 14.844 + 2.048) dan `biayaTetap` = system 23.793 + 3.000, sisanya negatif ⇒ lantai 20.000 tetap dipakai. **Cap itu tidak mungkin dicapai dengan memangkas riwayat**, karena `ringkasUkuran()` tidak pernah menyentuh pesan `system` (23.793 char sudah > cap sebelum satu pun pesan riwayat ikut). Yang dikorbankan selalu riwayat — itu temuan `A1-cap-tak-tercapai`. Menutup A2/A4 menuntut salah satu: naikkan `PAYLOAD_MAX_CHARS`, kuruskan system prompt, atau kuruskan katalog tool. Itu Patch #6 = keputusan pemilik.

---

## 2. Verifikasi nomor baris dokumen (drift)

Semua hunk dokumen **cocok tepat 1x** saat ditambal (assert `count == 1`), jadi **tidak ada drift yang menghalangi**. Pergeseran di bawah ini murni akibat sisipan lane ini:

| patch | nomor di dokumen | saat penambalan | sekarang |
|---|---|---|---|
| #1 | `contextBudget.ts` ~:183 / ~:189 | sama (183 / 189) | loop **199**, penjaga **205** (+16: komentar sisipan) |
| #2 | `aiStore.ts` ~:5929-5930 | sama | `reserveTools` **5976**, `biayaTetap`/`capUntukPesan` **5998-6008** |
| #3 | `aiStore.ts` ~:6009-6024 | sama | `potongCatatan(statusPekerjaan(...))` **6088**, gerbang **6116** |
| #4a | `aiStore.ts` ~:6241 | sama | entri langkah **6331** |
| #4b | `aiStore.ts` ~:6248-6253 | sama | pesan lanjutan **6339-6343** |
| #4c | `aiStore.ts` ~:6042-6047 (EN) | sama | jalur EN **6133-6136** |
| #5 | `openai.rs` ~:633-635 | sama | `Err(format!(...))` **655-658**, helper `cuplik_argumen` **604-624** |

Catatan rev: dokumen menggambarkan penjaga lama sebagai `if (i === clone.length - 1 && m.role === 'tool') continue;`. Di rev saat penambalan baris itu **memang ada** di `HEAD` (`git diff` menampilkan `-    if (i === clone.length - 1 && m.role === 'tool') continue;`), dan dokumen sendiri (baris 32/49/73 `docs/USULAN-ANGGARAN-PESAN.md`) meminta bentuk akhir tanpa cek role. Perubahan itu diterapkan persis seperti yang diminta dokumen dan **tidak mengubah perilaku**: dulu loop berhenti di `clone.length - 1` (elemen terakhir tak pernah disentuh), sekarang loop mencapainya dan penjaga `continue` di sana.

---

## 3. Teks lama → teks baru (verbatim)

### Patch #1 — `src/lib/contextBudget.ts`

Lama:
```ts
  for (let i = 0; i < clone.length - 1; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan. */
    if (i === clone.length - 1 && m.role === 'tool') continue;
```
Baru (komentar 16 baris + batas loop + penjaga):
```ts
  /*
   * Batas loop MENJANGKAU elemen terakhir (`i < clone.length`, bukan
   * `clone.length - 1`). Versi lama berbunyi `i < clone.length - 1`, sehingga
   * penjaga tepat di bawah (`if (i === clone.length - 1 ...) continue;`) TIDAK
   * PERNAH bisa benar: ... (kode mati)
   */
  for (let i = 0; i < clone.length; i++) {
    ...
    if (i === clone.length - 1) continue;
```

### Patch #2 — `src/lib/aiStore.ts` (~5976-6008)

Lama:
```ts
            const reserveTools = ukuranPayload([toolSpecs]) + 2048;
            const capUntukPesan = Math.max(20_000, PAYLOAD_MAX_CHARS - reserveTools);
```
Baru:
```ts
            const reserveTools = ukuranPayload([toolSpecs]) + 2048;
            const biayaTetap =
              ukuranPayload(history.filter((m) => m.role === 'system')) + KALIMAT_PASCA_POTONG_CHARS;
            const sisaRiwayat = PAYLOAD_MAX_CHARS - reserveTools - biayaTetap;
            if (sisaRiwayat < 20_000) {
              console.warn(
                `[aiStore] anggaran riwayat cuma ${sisaRiwayat} char ` + ... ,
              );
            }
            const capUntukPesan = Math.max(20_000, sisaRiwayat);
```

### Patch #3 — `src/lib/aiStore.ts` (konstanta + `potongCatatan` di 94/104; tiga situs catatan)

Lama (catatan tak terbatas):
```ts
              const catatanStatus = statusPekerjaan(get().agentTodos, get().agentSteps, langkah + 1, MAX_AGENT_STEPS);
```
Baru:
```ts
              const catatanStatus = potongCatatan(
                statusPekerjaan(get().agentTodos, get().agentSteps, langkah + 1, MAX_AGENT_STEPS),
              );
```
plus `potongCatatan(...)` membungkus blok gerbang (6116) dan blok koreksi (6133).
Konstanta baru: `KALIMAT_PASCA_POTONG_CHARS = 3_000`, **`CATATAN_MAKS_CHARS = 240`** (dokumen mengusulkan 1.200), dan:
```ts
export function potongCatatan(teks: string, maks = CATATAN_MAKS_CHARS): string {
  if (teks.length <= maks) return teks;
  const penanda = `\n[...catatan dipotong: ${teks.length} -> ${maks} char]`;
  const jatah = Math.max(0, maks - penanda.length);
  const kasar = teks.slice(0, jatah);
  const batasBaris = kasar.lastIndexOf('\n');
  const isi = batasBaris > jatah / 2 ? kasar.slice(0, batasBaris) : kasar;
  return `${isi}${penanda}`;
}
```
Dipotong pada batas baris supaya item rencana tidak terbelah, dan ekornya diganti penanda yang menyebut ukuran asli.

### Patch #4 — `src/lib/aiStore.ts` (3 situs)

Lama (entri langkah, 6331): `result: \`Panggilan ... rusak: ${res.error}\`` → **tetap** (sudah menyebut `res.error`).
Lama (pesan lanjutan, 6339-6343): `content: 'Panggilan tool terakhirmu punya JSON argumen yang tidak valid, ...'` (tanpa rincian).
Baru:
```ts
              content:
                `Rincian dari provider: ${res.error}. ` +
                'Panggilan tool terakhirmu punya JSON argumen yang tidak valid, ...',
```
Lama (jalur EN, 6133-6136) — **tanpa `res.error`**:
```ts
              pesan.push({
                role: 'user',
                content: 'The previous response had invalid tool-call arguments, so no tool was run. Retry with complete, valid JSON object arguments.',
              });
```
Baru:
```ts
              pesan.push({
                role: 'user',
                content: potongCatatan(
                  `${res.error}. The previous response had invalid tool-call arguments, so no tool was run. ` +
                    'Retry with complete, valid JSON object arguments.',
                ),
              });
```

### Patch #5 — `src-tauri/src/adapters/openai.rs` (helper 604-624, galat 655-658)

Lama:
```rust
    Err(format!(
        "tool call \"{name}\" returned malformed JSON arguments"
    ))
```
Baru:
```rust
    Err(format!(
        "tool call \"{name}\" returned malformed JSON arguments: {}",
        cuplik_argumen(raw)
    ))
```
dengan helper baru `fn cuplik_argumen(raw: &str) -> String` (MAKS 160 char, karakter kontrol → spasi, ekor `… (+N char lagi)`). Panjangnya dikunci supaya pesan galat tidak merusak anggaran payload.

---

## 4. Cacat HARNESS yang ditambal (bukan melunakkan)

1. **M17** (`uji-malformed-args.mjs:381`). Jendela lama `SRC_STORE.slice(i - 200, i + 900)` menjangkau `throw new Error(res.error)` (baris 6347) di **bawah** ketiga penanda, sehingga melaporkan *3/3 situs menyertakan `res.error`* padahal sebenarnya **1/3**. Diganti jendela sempit per-situs (`pesan-lanjutan` −100/+60, `entri langkah` −40/+200, `koreksiArgumenTool` −100/+60). Sesudah tambalan M17 melaporkan apa adanya:
   ```
   LULUS  M17-pesan-ke-model — pesan-lanjutan (ID) (aiStore.ts:6341): res.error=true [jendela -100/+60], potongan argumen=true (lewat res.error -> cuplik_argumen); entri langkah (ID) (aiStore.ts:6331): res.error=true [jendela -40/+200], ...; koreksiArgumenTool (EN) (aiStore.ts:6134): ... [jendela -100/+60], ... → nama tool sampai ke model lewat res.error pada 3/3 situs, potongan argumen mentah pada 3/3 situs
   ```
   Perhatikan labelnya: potongan argumen **tidak** diklaim ada di teks TS, melainkan *lewat `res.error`* — dan itu **diverifikasi dari sumber Rust** (`RUST_MALFORMED_CUPLIK`, pola `returned malformed JSON arguments: {}`), bukan diasumsikan.
2. **D5 salah ekstraksi** (`uji-anggaran-pesan.mjs`). D5 mencari `SRC_OPENAI.indexOf('returned malformed JSON arguments')` — kemunculan pertama frasa itu ada di **komentar dokumen openai.rs baris 474**, bukan di kode; `lastIndexOf('Err(format!(')` lalu menemukan galat *objek* di atasnya. Akibatnya D5 membaca konstruksi yang salah dan **bisu terhadap Patch #5** (itu sebabnya D5 GAGAL walau produk sudah benar). Diganti pencarian pola `Err(format!(` yang lengkap.
3. **`T_MALFORMED`** (`uji-malformed-args.mjs` ~:93). Regex lama mensyaratkan kutip penutup tepat setelah `arguments` (`...arguments"`); produk sekarang berbunyi `...arguments: {}"`. Regex dilonggarkan **hanya pada titik itu** (kalimat tetap harus persis `tool call "{name}" returned malformed JSON arguments`), supaya tes tetap ketat.
4. **M16 gate** — bentuk ber-jalur `malformed` tidak lagi dihitung sebagai "kalimat galat tanpa potongan" **bila** sumber Rust benar-benar mencetak cuplikan (dicek dari `openai.rs`).

**Harness yang TIDAK saya lunakkan:** A1/A2/A4/B1/E2 tetap apa adanya; anggaran tetap melaporkan `capUntukPesan=20.000 tak tercapai` dan ekor terpotong. Angka `LULUS` naik, `GAGAL` turun dari 9 → 2, dan temuan turun 10 → 4 — **tidak ada kasus yang saya matikan**; yang hilang hanyalah temuan yang memang ditutup produk (`A3-kabel-lewat-batas`) dan cacat harness yang diperbaiki (jendela D5).

---

## 5. Keluaran harness sebelum/sesudah (apa adanya)

### Anggaran — SEBELUM
```
RINGKASAN: LULUS=11 GAGAL=9 TEMUAN=10
PUNCAK KABEL : puncak=41.512 char vs PAYLOAD_MAX_CHARS=40.000 (lewat batas di 44/44 giliran)
```
Sumber angka "sebelum" ini: **brief pemilik** (dikutip apa adanya). Keluaran pra-tambalan yang lengkap sudah tidak ada di konteks sesi ini, jadi saya tidak mengarang barisnya. Yang ada di disk dan bisa diperiksa: hasil antara sesudah produk ditambal tetapi sebelum angka `CATATAN_MAKS_CHARS` dikoreksi (puncak **40.975** char, `LULUS=16 GAGAL=4 TEMUAN=6`) dan hasil akhir di bawah.

### Anggaran — SESUDAH (`node scripts/uji-anggaran-pesan.mjs`, exit 1 karena sengaja mempertahankan A2/A4)
```
LULUS  C1-penjaga-statis — contextBudget.ts:199 batas loop 'for (let i = 0; i < clone.length; i++)' -> i_maks = clone.length - 1; penjaga baris 205 mensyaratkan i = clone.length - 1 -> TERJANGKAU (clone.length - 1 == clone.length - 1); penjaga DAPAT dieksekusi
LULUS  C2-penjaga-hidup — kode SEKARANG (batas i < clone.length) atas masukan yang ekornya pesan tool panjang: penjaga menyala 1 kali (harus >=1 = HIDUP); payload 84.081->3.868 char
LULUS  C3-penjaga-terjang-tapi-trim — ... walau penjaga menyala, trim-terakhir (contextBudget.ts:288-300) tetap memendekkan pesan terakhir (9.010→1.716 char, utuh=false) -> menambal penjaga SAJA tidak cukup
LULUS  A3-payload-giliran — 44 giliran; payload kabel (ukuranPayload(pesan)+ukuranPayload(tools)) 39.860-39.861 char; puncak 39.861 char vs PAYLOAD_MAX_CHARS=40.000; giliran yang MELEWATI batas=0/44
LULUS  A5-append-pasca-potong — ... penambahan puncak=227 char vs envelope KALIMAT_PASCA_POTONG_CHARS=3.000 char ... dan batas keras CATATAN_MAKS_CHARS=240 char (potongCatatan)
LULUS  D1-situs-entri-langkah — ... menyebut NAMA tool (res.error)=true, memuat POTONGAN argumen salah=true -> LENGKAP
LULUS  D2-situs-pesan-lanjutan — ... -> LENGKAP
LULUS  D3-situs-koreksi-EN — koreksiArgumenTool (EN) - aiStore.ts:6046 (aiStore.ts:6133): ... -> LENGKAP
LULUS  D4-cakupan-situs — 3 situs diuji TERPISAH (ditemukan 3/3); situs yang memuat nama+potongan=3/3
LULUS  D5-sumber-potongan-rust — openai.rs:604 parse_argumen_tool → galat malformed (openai.rs:633-635) 'tool call "{name}" returned malformed JSON arguments': menyebut NAMA tool=true, argumen ke-2 (potongan raw) dicetak=true -> potongan tersedia
LULUS  D6-nama-tool — situs yang menyebut NAMA tool ke model=3/3 (lewat res.error)
GAGAL  A2-cap-tercapai — capUntukPesan 20.000 char < blok tetap 23.793 char: TIDAK MUNGKIN dicapai (selisih 3.793 char); setiap giliran memaksa jalur potong-terakhir (contextBudget.ts:288-300) menyala
GAGAL  A4-pesan-lewat-cap — ukuranPayload(pesan) puncak=25.017 char vs capUntukPesan=20.000 char; lewat cap di 44/44 giliran (kelebihan puncak 5.017 char); reserve margin 2048 char vs kelebihan 5.017 char -> margin HABIS
TEMUAN A1-cap-tak-tercapai — systemPromptFor() (23.793 char) SUDAH melebihi capUntukPesan (20.000 char) sebelum satu pesan riwayat ikut; ringkasUkuran() tidak pernah menyentuh pesan system ...
TEMUAN B1-ekor-dipotong — 44/44 giliran mengirim pesan TERAKHIR yang bukan pesan terakhir asli (contoh: tool 6.030→505 char). Catatan pemotongan resmi produk ADA di 44/44 contoh -> model diberi tahu, jadi ini bukan pemotongan DIAM-DIAM ...
TEMUAN E2-tanpa-jeda — jalur argumen-cacat mengulang SEKETIKA (jeda 0 ms ...)
TEMUAN E-rumus — retryLimit dibaca dari sumber='retryableToolResponse ? (truncated ? 2 : 1) : AGENT_PROVIDER_RETRY_DELAYS.length' ...
RINGKASAN: LULUS=18 GAGAL=2 TEMUAN=4 (3722 ms)
PUNCAK KABEL : payload pesan+tools puncak=39.861 char vs PAYLOAD_MAX_CHARS=40.000 (lewat batas di 0/44 giliran); pesan-saja puncak=25.017 char vs cap=20.000
EKOR         : pesan terakhir berubah di 44/44 giliran; tanpa catatan pemotongan=0
```

### Malformed — SESUDAH (`node scripts/uji-malformed-args.mjs`, exit 0, TANPA `--tanpa-cargo` sehingga lapis Rust ikut jalan)
```
lapis eksekusi: cargo test --offline --lib adapters::openai → 10 lulus, 0 gagal (10 nama test terbaca)
LULUS  B1-cargo — cargo test --offline --lib adapters::openai → 10 lulus, 0 gagal ... (10 nama test)
LULUS  M17-pesan-ke-model — pesan-lanjutan (ID) (aiStore.ts:6341): res.error=true [jendela -100/+60], potongan argumen=true (lewat res.error -> cuplik_argumen); entri langkah (ID) (aiStore.ts:6331): res.error=true [jendela -40/+200], potongan argumen=true (lewat res.error -> cuplik_argumen); koreksiArgumenTool (EN) (aiStore.ts:6134): res.error=true [jendela -100/+60], potongan argumen=true (lewat res.error -> cuplik_argumen) → nama tool sampai ke model lewat res.error pada 3/3 situs, potongan argumen mentah pada 3/3 situs
TEMUAN M16-potongan-argumen — 4/14 kalimat galat menyebut NAMA tool tetapi TIDAK memuat potongan argumen yang salah (M2-terpotong-batas-token, M9-tipe-salah-array, M11-tanpa-nama-fungsi, M13-provider-429). Di openai.rs, `raw_args` hanya dipakai di baris 238, 247, 607 - semuanya untuk parsing, bukan untuk laporan. Usulan: lihat docs/LAPORAN-BEBAN-DAN-MALFORMED.md (patch openai.rs ~633).
RINGKASAN: LULUS=23 GAGAL=0 TEMUAN=1 dari 14 bentuk cacat (1306 ms)
```
Catatan eksekusi: jalan pertama harfiah `node scripts/uji-malformed-args.mjs` saya jalankan di shell **terlepas/detached** dan keluar 1 dengan satu baris `stdin is not a tty` (artefak shell tanpa tty, bukan keluaran harness). Dijalankan ulang di foreground: **exit 0**, keluaran di atas. Invokasi kargo yang identik juga saya buktikan terpisah: `execFileSync('cargo', ['test','--offline','--lib','adapters::openai','--','--test-threads=1'], ...)` → `10 passed; 0 failed`.

### Malformed — SEBELUM
Keluaran pra-tambalan harness **tidak** tersimpan di konteks sesi ini; yang saya pegang hanyalah deskripsi pemilik: jendela lebar `slice(i-200, i+900)` membuat M17 salah melaporkan *"3/3 situs menyertakan res.error"* padahal sebenarnya **1/3**. Saya tidak menyusun ulang barisnya. Bukti terdekat yang nyata adalah hasil sesudah tambalan harness dengan `--tanpa-cargo` (sebelum D5/CATATAN_MAKS dikoreksi):
```
RINGKASAN: LULUS=22 GAGAL=0 TEMUAN=2 dari 14 bentuk cacat (9 ms)
```

---

## 6. `cargo test --lib` dan `tsc`

```
test result: ok. 518 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 7.07s
```
Baseline yang diberikan: 504 passed / 0 failed. Sekarang **518 passed / 0 failed** (naik 14; tidak ada yang turun, tidak ada yang gagal). Kenaikan itu bukan dari lane ini — patch Rust lane ini hanya menambah `fn cuplik_argumen` tanpa `#[cfg(test)]`; test `adapters::openai` sendiri tetap 10 dan semuanya lulus.

```
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
TSC_EXIT=0
```

---

## 7. Klasifikasi: PRODUK vs HARNESS vs keputusan pemilik

**Cacat PRODUK (ditambal):** penjaga mati `contextBudget.ts` (#1); `capUntukPesan` tidak mengurangi blok tetap (#2); catatan pasca-potong di luar anggaran (#3); nama tool/potongan argumen hilang di 3 situs pesan galat (#4, khususnya jalur EN yang sebelumnya benar-benar tanpa `res.error`); `raw_args` tak pernah dilaporkan (#5).

**Cacat HARNESS (ditambal):** M17 jendela lebar (lapor 3/3 padahal 1/3); D5 salah ekstraksi (kena komentar → bisu terhadap Patch #5); `T_MALFORMED` tidak lagi cocok setelah kalimat berubah; M16 belum tahu cuplikan kini ada.

**Keputusan pemilik (TIDAK disentuh):** `PAYLOAD_MAX_CHARS` tetap 40.000, jadi `capUntukPesan` 20.000 **tetap tak tercapai** (blok tetap 40.687 > 40.000) dan A2/A4 tetap GAGAL. Angka `CATATAN_MAKS_CHARS=240` bukan pilihan estetika: dengan beban 44 giliran headroom terukur cuma ~366 char, dan 1.200 seperti di dokumen membuat payload **tetap** lewat batas (terukur 40.975 char pada percobaan pertama lane ini). Ini dilaporkan supaya tidak terlihat seperti cap yang "berhasil".

**Yang TIDAK diklaim selesai:** nol temuan ≠ nol cacat. Sisa temuan A1/B1/E2 dan M16 adalah cacat nyata yang berada di luar wewenang/berkas lane ini.

---

## 8. Sisa / perlu keputusan

1. **A2/A4 + A1**: naikkan `PAYLOAD_MAX_CHARS` (≥ ~41.000 untuk menampung blok tetap + riwayat minimal), atau kuruskan `systemPrompt` (23.793) / spec tool (14.844). Tanpa itu, setiap giliran selalu memaksa jalur potong-terakhir dan `capUntukPesan` tinggal hiasan.
2. **B1**: ekor terpotong (tool 6.030 → 505 char) walau bercatatan resmi. Karena blok tetap > cap, pesan terakhir selalu dipendekkan; ini konsekuensi langsung dari #1 di atas.
3. **E2**: jalur argumen-cacat mengulang tanpa jeda (0 ms). Aman selama RTT provider ≥ 858 ms; angka batas laju tidak ada di kode. Perlu keputusan: pacer kecil atau biarkan.
4. **M16**: 4 dari 14 kalimat galat (terpotong, tipe-salah-array, tanpa-nama-fungsi, provider-429) masih tanpa potongan argumen. Patch #5 hanya menyentuh kalimat `malformed` persis seperti ruang lingkup dokumen; menyentuh sisanya memperluas jangkauan dan menyentuh perilaku yang dipakai test Rust lain.
5. **Angka `CATATAN_MAKS_CHARS`**: 240 char itu ~3 baris. Kalau pemilik ingin catatan rencana utuh, itu menuntut #1 (naikkan anggaran) — bukan menaikkan angka ini sendirian.

## 9. Jejak verifikasi (apa adanya)

* `node scripts/uji-anggaran-pesan.mjs` → exit 1 (sengaja: A2/A4 dipertahankan) — keluaran §5.
* `node scripts/uji-malformed-args.mjs` → exit 0 — keluaran §5.
* `cargo test --lib` → 518 passed / 0 failed.
* `tsc --noEmit --incremental false` → exit 0.
* Tidak ada app/CDP dijalankan; tidak ada `git add/commit/clean`; tidak ada wildcard di `scripts/`.
