# USULAN ANGGARAN PESAN — patch konkret (BUG-ANGGARAN-PESAN)

Dasar: `docs/LAPORAN-ANGGARAN-PESAN.md` (harness `scripts/uji-anggaran-pesan.mjs`, LULUS=11 GAGAL=9 TEMUAN=10).

**Tidak ada berkas produk yang diubah di sini.** Semua usulan di bawah menyebut berkas + nomor baris +
teks lama/teks baru, agar bisa diterapkan apa adanya oleh pemilik repo.

Akar yang ditemukan, berurut menurut dampak:

1. **Anggaran riwayat mustahil** — `capUntukPesan` (23.251) < `systemPromptFor` (23.793) ⇒ payload kabel
   **41.512 > 40.000** di **44/44** giliran.
2. **Tiga kalimat ditempel SETELAH pemotongan** (di luar anggaran, sampai **2.023** char).
3. **Penjaga `contextBudget.ts:188-189` MATI** (batas loop 183 sudah mengecualikan elemen terakhir).
4. **Situs pesan argumen-cacat**: 0/3 memuat potongan argumen, 1/3 memuat nama tool —
   akar terdalam: **Rust membuang `raw`** sebelum galat sampai ke JS.

---

## Patch #1 — `src/lib/contextBudget.ts` (penjaga mati / kode mati + komentar menyesatkan)

**Nomor baris: 183-189.**

Teks lama (verbatim):

```ts
  for (let i = 0; i < clone.length - 1; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan. */
    if (i === clone.length - 1 && m.role === 'tool') continue;
```

### Opsi 1a (REKOMENDASI — tanpa ubah perilaku, hapus kebohongan)

Hapus penjaga mati + komentar yang menjanjikan perlindungan yang tak ada. Perlindungan giliran terakhir
nyatanya dilakukan jalur potong-terakhir di bawah (baris 288-300), yang **menyertakan catatan eksplisit**.

Teks baru:

```ts
  for (let i = 0; i < clone.length - 1; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /*
     * CATATAN: dulu ada `if (i === clone.length - 1 && m.role === 'tool') continue;`
     * di sini. Baris itu KODE MATI - batas loop `i < clone.length - 1` sudah
     * mengecualikan indeks terakhir, jadi kondisi itu tidak pernah benar
     * (dibuktikan scripts/uji-anggaran-pesan.mjs kasus C1/C2: 0 kali menyala).
     * Giliran terakhir memang TIDAK dilindungi di pass ini; ia dipendekkan oleh
     * jalur potong-terakhir di bawah DAN diberi catatan "batas gateway" yang
     * terlihat model. Kalau kelak giliran terakhir harus benar-benar utuh,
     * itu bukan sekadar menghapus penjaga - lihat docs/USULAN-ANGGARAN-PESAN.md.
     */
```

### Opsi 1b (kalau maksud komentar mau dihidupkan — TIDAK menyelesaikan overshoot)

Teks baru:

```ts
  for (let i = 0; i < clone.length; i++) {
    if (ukuran() <= cap) break;
    const m = clone[i];
    const isi = typeof m.content === 'string' ? m.content : String(m.content ?? '');
    if (isi.length <= STUB) continue;
    /* Giliran terakhir selalu dibiarkan utuh; ia yang sedang dikerjakan.
     * Batas loop HARUS `i < clone.length`: dengan `clone.length - 1` penjaga
     * ini mati (kasus C1/C2). */
    if (i === clone.length - 1) continue;
```

> Konsekuensi terukur (kasus C3): walau penjaga menyala, jalur potong-terakhir **tetap**
> memendekkan pesan terakhir (9.010→1.716 char). Jadi opsi 1b hanya menambal kode mati,
> **bukan** menyelesaikan butir (b). Perbaikan sebenarnya ada di Patch #2/#6.

---

## Patch #2 — `src/lib/aiStore.ts:5929-5930` (`reserveTools` / `capUntukPesan`)

Akar overshoot. `capUntukPesan` mengasumsikan blok tetap "muat" di dalam reserve, padahal
`systemPromptFor` saja sudah lebih besar dari cap.

Teks lama (verbatim):

```ts
            const reserveTools = ukuranPayload([toolSpecs]) + 2048;
            const capUntukPesan = Math.max(20_000, PAYLOAD_MAX_CHARS - reserveTools);
```

Teks baru:

```ts
            const reserveTools = ukuranPayload([toolSpecs]) + 2048;
            /*
             * Anggaran riwayat = sisa SETELAH tools DAN blok yang tak bisa
             * dipotong `ringkasRiwayat`:
             *   (a) pesan `system` - `ringkasUkuran` tidak pernah menyentuhnya
             *       (terukur 23.793 char pada prompt penuh), dan
             *   (b) kalimat yang ditempel SESUDAH pemotongan (catatan status /
             *       gerbang rencana / koreksi argumen, terukur sampai 2.023 char).
             * Tanpa dikurangi, `capUntukPesan` (23.251) TURUN DI BAWAH blok
             * tetap (23.793) dan setiap giliran terpaksa lewat jalur
             * potong-terakhir sehingga payload kabel melewati PAYLOAD_MAX_CHARS
             * (terukur 41.512 > 40.000 di 44/44 giliran).
             */
            const biayaTetap =
              ukuranPayload(history.filter((m) => m.role === 'system')) + KALIMAT_PASCA_POTONG_CHARS;
            const sisaRiwayat = PAYLOAD_MAX_CHARS - reserveTools - biayaTetap;
            if (sisaRiwayat < 20_000) {
              /*
               * Blok tetap + reserve sudah melebihi PAYLOAD_MAX_CHARS: tidak ada
               * anggaran riwayat yang sah. Dulu kondisi ini LOLOS DIAM-DIAM.
               * Jangan berpura-pura memotong - beri tahu supaya dipilih:
               * naikkan PAYLOAD_MAX_CHARS, kecilkan system prompt, atau kurangi
               * tool yang dikirim. (Lihat Patch #6.)
               */
              console.warn(
                `[anggaran pesan] blok tetap ${biayaTetap} + reserve ${reserveTools} ` +
                  `> PAYLOAD_MAX_CHARS ${PAYLOAD_MAX_CHARS}; payload giliran akan melewati batas`,
              );
            }
            const capUntukPesan = Math.max(20_000, sisaRiwayat);
```

Tambahan konstanta (taruh dekat konstanta modul, mis. dekat `PAYLOAD_MAX_CHARS`):

```ts
/** Perkiraan maksimum byte kalimat yang ditempel SETELAH ringkasRiwayat(). */
const KALIMAT_PASCA_POTONG_CHARS = 3_000;
```

> Catatan kejujuran: tanpa Patch #6, patch ini **tidak** membuat payload muat — ia membuat anggaran
> **berhenti berbohong** dan memunculkan peringatan. Perhitungan: blok tetap riil = system (23.793) +
> spec tool (14.699) + catatan pasca-potong (~2.000) = **~40.492 char**, sudah di atas 40.000
> **tanpa satu pesan riwayat pun**. Karena itu Patch #6 wajib diputuskan.

---

## Patch #3 — `src/lib/aiStore.ts:6009-6024` (catatan status ditempel di luar anggaran)

Teks lama (verbatim):

```ts
            {
              const catatanStatus = statusPekerjaan(
                get().agentTodos,
                get().agentSteps,
                langkah + 1,
                MAX_AGENT_STEPS,
              );
              const terakhir = pesan[pesan.length - 1];
              if (terakhir && terakhir.role !== 'assistant') {
                pesan[pesan.length - 1] = {
                  ...terakhir,
                  content: `${terakhir.content}\n\n${catatanStatus}`,
                };
              } else {
                pesan.push({ role: 'user', content: catatanStatus });
              }
            }
```

Teks baru (batasi tiap kalimat pasca-potong, supaya tak bisa menembus anggaran):

```ts
            {
              const catatanStatus = potongCatatan(
                statusPekerjaan(get().agentTodos, get().agentSteps, langkah + 1, MAX_AGENT_STEPS),
                CATATAN_MAKS_CHARS,
              );
              const terakhir = pesan[pesan.length - 1];
              if (terakhir && terakhir.role !== 'assistant') {
                pesan[pesan.length - 1] = {
                  ...terakhir,
                  content: `${terakhir.content}\n\n${catatanStatus}`,
                };
              } else {
                pesan.push({ role: 'user', content: catatanStatus });
              }
            }
```

Helper + konstanta (taruh dekat konstanta modul):

```ts
/** Batas tiap kalimat yang ditempel setelah pemotongan (lihat Patch #2). */
const CATATAN_MAKS_CHARS = 1_200;
function potongCatatan(teks: string, maks: number): string {
  return teks.length <= maks ? teks : `${teks.slice(0, maks - 20)}\n... [catatan dipotong]`;
}
```

Terapkan `potongCatatan(...)` yang sama pada dua situs lain di jalur yang sama:
- `gerbangRencana` (sekitar baris 6026-6040),
- `koreksiArgumenTool` (sekitar baris 6042-6047) — sekaligus Patch #4b.

---

## Patch #4 — `src/lib/aiStore.ts` (nama tool + potongan argumen pada pesan pemulihan)

### 4a. Situs pesan-lanjutan — baris 6248-6253 (temuan D2: TANPA nama, TANPA potongan)

Teks lama (verbatim):

```ts
            history.push({
              role: 'user',
              content:
                'Panggilan tool terakhirmu punya JSON argumen yang tidak valid, jadi tidak ada tool yang berjalan. ' +
                'Jangan ulangi panggilan yang sama. Tulis ulang panggilan itu dengan objek JSON argumen yang lengkap dan valid, ' +
                'atau kalau tidak diperlukan, lanjutkan ke langkah berikutnya dari rencanamu.',
            });
```

Teks baru:

```ts
            history.push({
              role: 'user',
              content:
                `Panggilan tool terakhirmu punya JSON argumen yang tidak valid, jadi tidak ada tool yang berjalan. ` +
                `Rincian dari provider: ${res.error}. ` +
                'Jangan ulangi panggilan yang sama. Tulis ulang panggilan itu dengan objek JSON argumen yang lengkap dan valid, ' +
                'atau kalau tidak diperlukan, lanjutkan ke langkah berikutnya dari rencanamu.',
            });
```

### 4b. Situs koreksi EN — baris 6042-6047 (temuan D3: TANPA nama, TANPA potongan)

Teks lama (verbatim, perhatikan indentasi asli yang lebih satu spasi):

```ts
            if (koreksiArgumenTool) {
               pesan.push({
                 role: 'user',
                 content:
                   'The previous response had invalid tool-call arguments, so no tool was run. Retry with complete, valid JSON object arguments.',
               });
             }
```

Teks baru:

```ts
            if (koreksiArgumenTool) {
               pesan.push({
                 role: 'user',
                 content:
                   `${res.error}. The previous response had invalid tool-call arguments, so no tool was run. Retry with complete, valid JSON object arguments.`,
               });
             }
```

### 4c. Situs entri-langkah — baris 6241 (sudah punya nama; potongan menyusul dari Patch #5)

Sudah: `result: \`Panggilan tool terakhir ber-JSON argumen rusak dan tidak dijalankan: ${res.error}\``
— **tidak perlu diubah**; ia mulai memuat potongan begitu Patch #5 mengirimkannya di `res.error`.

---

## Patch #5 — `src-tauri/src/adapters/openai.rs` (Rust membuang potongan argumen) — AKAR TERDALAM

`raw` dibaca baris 238 (`raw_args`), dipakai baris 247 (`parse_argumen_tool(raw_args, false, name)?`),
tetapi galat malformed (baris **633-635**) tidak menginterpolasinya.

Teks lama (verbatim):

```rust
    Err(format!(
        "tool call \"{name}\" returned malformed JSON arguments"
    ))
```

Teks baru:

```rust
    Err(format!(
        "tool call \"{name}\" returned malformed JSON arguments: {}",
        cuplik_argumen(raw)
    ))
```

Helper baru (taruh tepat di sebelum `fn parse_argumen_tool`):

```rust
/// Cuplikan argumen mentah untuk pesan galat - cukup agar model bisa mengenali
/// panggilan mana yang rusak, tanpa membanjiri konteks. Karakter kontrol
/// di-escape supaya pesan tetap satu baris.
fn cuplik_argumen(raw: &str) -> String {
    const MAKS: usize = 200;
    let kepala: String = raw.chars().take(MAKS).collect();
    let escaped = kepala
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t");
    if raw.chars().count() > MAKS {
        format!("{}… ({} char total)", escaped, raw.chars().count())
    } else {
        escaped
    }
}
```

> Opsional: galat "terpotong karena batas token" (baris 628-631) juga bisa diberi `cuplik_argumen(raw)`
> dengan alasan yang sama.

**Setelah Patch #4 + #5:** situs D1/D2/D3 memuat **nama tool** (via `${res.error}`) **dan potongan
argumen** (via `cuplik_argumen`) ⇒ kasus D1/D2/D3/D5/D6 di harness akan **hijau**.

---

## Patch #6 — KEPUTUSAN PEMILIK (wajib dipilih; angka pendukung)

Blok tetap yang tak bisa dipotong sudah **~40.492 char** (system 23.793 + spec tool 14.699 + catatan
pasca-potong ~2.000) — di atas `PAYLOAD_MAX_CHARS` **40.000** sebelum satu pesan riwayat pun.
Karena itu harus ada satu dari:

| Opsi | Perubahan | Efek angka |
|---|---|---|
| **6a. Naikkan batas** | `PAYLOAD_MAX_CHARS` 40.000 → **≥ 48.000** | menyisakan ~7.500 char riwayat setelah blok tetap |
| **6b. Kecilkan system prompt** | `src/lib/systemPrompt.ts` dipangkas (23.793 char = 59% batas) | tiap char dipangkas = 1 char anggaran riwayat; perlu ≥ 4.500 char |
| **6c. Kurangi tool yang dikirim** | `alatKirim` (mis. `pilihToolTugas` lebih agresif) | spec 26 tool = 14.699 char; buang separuh ⇒ ~7.300 char |
| **6d. Terima + beri tahu** | biarkan lewat batas, tapi Patch #2 memunculkan `console.warn` | tidak menambah ruang; hanya menghapus mode diam |

**Rekomendasi:** 6a **atau** 6b — kombinasi 6a+6c paling aman. 6d hanya sebagai penambal sementara.

---

## Urutan penerapan yang disarankan

1. Patch #5 (Rust) — membuka data yang dibutuhkan #4.
2. Patch #4a/#4b (aiStore) — memakai `res.error`.
3. Patch #3 (batasi kalimat pasca-potong) — menyusutkan "biaya tetap" yang dihitung #2.
4. Patch #2 (anggaran jujur + peringatan) — bergantung pada `KALIMAT_PASCA_POTONG_CHARS` (#3).
5. Patch #1 (kode mati contextBudget.ts) — bersih-bersih, tanpa ubah perilaku.
6. Patch #6 (keputusan batas/prompt/tool) — **penentu** apakah payload akhirnya ≤ 40.000.

## Verifikasi setelah patch

```bash
cd D:/Zephyr
node scripts/uji-anggaran-pesan.mjs                 # target: A2/A3/A4/A5/D1/D2/D3/D5/D6 hijau
node scripts/uji-malformed-args.mjs                 # jendela M17 sebaiknya dipersempit dulu
node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
```

Harness ini **patch-aware**: `D5` membaca argumen ke-2 pada `Err(format!(...))`, jadi ia otomatis
hijau begitu Patch #5 diterapkan; `D1/D2/D3` membaca teks `res.error` per-situs dengan jendela sempit.
