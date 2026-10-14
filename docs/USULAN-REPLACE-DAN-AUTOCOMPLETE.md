# USULAN PATCH — Ganti Lintas Berkas & Autocomplete Inline

Item: **ZEPH-REPLACE-IN-FILES** · **ZEPH-AUTOCOMPLETE-INLINE**
Tanggal: 2026-10-14 · Sifat: **usulan** — kode produk READ-ONLY, tidak satu patch
pun diterapkan di sini.

Basis angka & keluaran: `docs/RANCANGAN-REPLACE-DAN-AUTOCOMPLETE.md` (§0 bukti:
harness 26/26 & 11/11, `tsc --noEmit` exit 0, `cargo test --lib ganti_` 5 passed).

**Penting soal nomor baris.** Nomor di bawah adalah potret pada commit saat uji
(grep sendiri). Setiap patch menyertakan **teks lama** sebagai anchor; gunakan
teks itu, bukan nomor baris, bila berkas sudah bergeser.

Ringkasan berkas yang disentuh bila semua usulan diterima:

| # | Berkas | Sifat | Untuk |
|---|---|---|---|
| U1 | `src-tauri/src/search.rs` | tambah medan struct | lokasi baris + tanda baris kosong |
| U2 | `src-tauri/src/search.rs` | isi medan | hitung baris dari posisi kecocokan |
| U3 | `src-tauri/src/search.rs` | bantu | penanda 3 baris kosong |
| U4 | `src/lib/zephyrTools/builtins.ts` | laporan | sebut lokasi di pesan hasil |
| U5 | `src/lib/ghostText.ts` | sambung seam | pakai penyedia lokal sebelum AI |

---

## U1 — `src-tauri/src/search.rs` : tambah medan pada `ReplaceHasil`

Anchor (sekitar baris **674**):

```rust
pub struct ReplaceHasil {
    pub path: String,
    pub jumlah: usize,

    pub snapshot: String,
    pub error: String,
}
```

Usulan:

```rust
pub struct ReplaceHasil {
    pub path: String,
    pub jumlah: usize,
    /// Nomor baris 1-basis tiap kecocokan yang diganti (urut naik). Kosong bila
    /// tidak ada yang diganti.
    pub baris: Vec<usize>,
    /// true bila isi SESUDAH memuat >=3 baris kosong berurutan yang TIDAK ada di
    /// isi SEBELUM - tanda penggantian menyisipkan baris kosong bertumpuk.
    pub baris_kosong_berlebih: bool,

    pub snapshot: String,
    pub error: String,
}
```

Catatan: `#[serde(rename_all = "camelCase")]` sudah ada di struct, jadi JS
menerima `baris` dan `barisKosongBerlebih`. **Semua** tiga tempat yang
membangun `ReplaceHasil` (baris ~763 biner, ~795 tanpa cocok, ~821 sukses,
~828 jalur galat) harus diisi medan baru ini, kalau tidak kompilasi gagal:

- biner (~763) & tanpa cocok (~795): `baris: Vec::new(), baris_kosong_berlebih: false,`
- jalur galat (~828): `baris: Vec::new(), baris_kosong_berlebih: false,`
- sukses (~821): `baris, baris_kosong_berlebih,` (lihat U2)

---

## U2 — `src-tauri/src/search.rs` : isi `baris` dan `baris_kosong_berlebih`

Anchor A (sekitar baris **793**):

```rust
            let jml = re.find_iter(&teks).count();
            if jml == 0 {
```

Usulan:

```rust
            /* Nomor baris 1-basis dari tiap kecocokan: hitung newline sebelum
             * posisi mulai. Dipakai untuk melaporkan LOKASI, bukan hanya jumlah. */
            let baris: Vec<usize> = re
                .find_iter(&teks)
                .map(|m| teks[..m.start()].bytes().filter(|b| *b == b'\n').count() + 1)
                .collect();
            let jml = baris.len();
            if jml == 0 {
```

Anchor B (sekitar baris **802**):

```rust
            let baru = re.replace_all(&teks, replacement).to_string();
```

Usulan:

```rust
            let baru = re.replace_all(&teks, replacement).to_string();
            let baris_kosong_berlebih =
                ada_tiga_kosong(&baru) && !ada_tiga_kosong(&teks);
```

Anchor C (sekitar baris **821**, blok `Ok(ReplaceHasil { ... })` sukses):

```rust
            Ok(ReplaceHasil {
                path: f.clone(),
                jumlah: jml,
                snapshot: snap,
                error: String::new(),
            })
```

Usulan:

```rust
            Ok(ReplaceHasil {
                path: f.clone(),
                jumlah: jml,
                baris,
                baris_kosong_berlebih,
                snapshot: snap,
                error: String::new(),
            })
```

---

## U3 — `src-tauri/src/search.rs` : fungsi bantu penanda baris kosong

Tambahkan dekat `MAKS_BERKAS_GANTI` (sekitar baris **701**), sebelum
`pub fn ganti_lintas_berkas`:

```rust
/// Benar bila `s` memuat >=3 baris kosong berurutan (spasi/tab di antaranya
/// diabaikan agar CRLF dan indentasi tidak menyamarkan). Dipakai untuk `baris_kosong_berlebih`.
fn ada_tiga_kosong(s: &str) -> bool {
    regex::Regex::new(r"\n[ \t]*\n[ \t]*\n").unwrap().is_match(s)
}
```

(Alternatif tanpa regex: sisir byte sekali. Regex dipakai karena `regex` sudah
jadi dependensi berkas ini.)

---

## U4 — `src/lib/zephyrTools/builtins.ts` : sebut lokasi di laporan

Anchor (sekitar baris **972**):

```ts
      const baris = berubah.map((h) => `  ${h.path}  (${h.jumlah} penggantian)`);
```

Usulan:

```ts
      const baris = berubah.map((h) => {
        const semua = (h.baris as number[] | undefined) ?? [];
        const lok = semua.slice(0, 6).map((n) => `baris ${n}`).join(', ');
        const sisa = semua.length > 6 ? `, +${semua.length - 6} lagi` : '';
        const tanda = h.barisKosongBerlebih ? '  [baris kosong berlebih]' : '';
        return `  ${h.path}  (${h.jumlah} penggantian${lok ? ': ' + lok + sisa : ''})${tanda}`;
      });
```

Catatan aman-mundur: `?? []` membuat laporan tetap benar walau backend lama
(belum mengirim `baris`). **Tipe** `ReplaceHasil` di bindings/generik Tauri
mungkin perlu ditambah `baris?: number[]; barisKosongBerlebih?: boolean` agar
`tsc` tidak mengeluh — sesuaikan di berkas tipe yang dihasilkan/pin yang
memuat `ReplaceHasil`.

---

## U5 — `src/lib/ghostText.ts` : sambungkan seam penyedia lokal

**Temuan yang jadi dasar:** `ghostText.ts:208` `mintaSaran` memanggil
`cmd.aiChat` langsung (`:242`), sedangkan seam murni `ghostPemasok.ts`
(`ambilSaran`, `:355`) tidak diimpor siapa pun. Patch ini menyambungkan yang
sudah ada — **tanpa** perintah Rust baru dan **tanpa** jaringan di jalur lokal.

### U5a — tambah impor (dekat impor yang ada, mis. sekitar baris **106**)

Anchor:

```ts
import { ghostText, lepasGhost } from '../../lib/ghostText';
```

…adalah baris di `CodeMirrorEditor.tsx`, bukan di sini. Di `ghostText.ts`
impor teratas adalah:

```ts
import type { AiChunk, AiMessage } from './types';
```

Usulan (tambah baris baru setelah impor tipe):

```ts
import { ambilSaran, PEMASOK_LOKAL, setPemasokSaran } from './ghostPemasok';
```

### U5b — pasang pemasok lokal sekali (dekat `export function ghostText(on)` ~baris **399**)

Anchor:

```ts
export function ghostText(on: boolean): Extension[] {
```

Usulan — tambahkan **sebelum** fungsi itu:

```ts
/*
 * Pasang penyedia LOKAL sekali saat modul dimuat. Penyedia ini murni (tanpa
 * jaringan, tanpa kunci API) dan mengisi saran sepele: penutup `}`, kepala
 * badan ` {`, lanjutan baris atas. Jalur AI tetap ada sebagai cadangan di
 * `mintaSaran` - jadi ini tidak mengubah perilaku saat seam mengembalikan null.
 */
setPemasokSaran(PEMASOK_LOKAL);
```

### U5c — coba seam lokal dulu di `mintaSaran` (sekitar baris **208**)

Anchor:

```ts
async function mintaSaran(view: EditorView) {
  const ai = useAi.getState();
  const def = findModel(ai.model, ai.provider);
```

Usulan:

```ts
async function mintaSaran(view: EditorView) {
  /*
   * Jalur LOKAL dulu: murni, tanpa jaringan, tanpa kunci API. Bila seam
   * mengembalikan usulan, tampilkan dan berhenti - jangan panggil model.
   * Bila null (tak ada pola yang dilanjutkan, seam mati, atau pemasok melempar),
   * jatuh ke jalur AI seperti semula - TIDAK ada regresi.
   */
  const path = view.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? '';
  const bahasa = path.includes('.') ? path.split('.').pop() ?? 'plain' : 'plain';
  const lokal = await ambilSaran(konteksSekitar(view), bahasa, { path });
  if (lokal) {
    viewAktif = view;
    tampilkan(lokal.teks.split('\n')[0]);
    return;
  }

  const ai = useAi.getState();
  const def = findModel(ai.model, ai.provider);
```

Catatan integrasi: `tampilkan()` (`ghostText.ts:180`) dan `terimaGhost()`
(`:269`) sudah menangani merender & menerima widget, jadi Tab menerima saran
lokal lewat jalur yang sama. Perlu dipastikan `pastikanListener()` TIDAK perlu
dipanggil untuk jalur lokal (tidak ada streaming) — pada usulan di atas ia
hanya dipanggil di jalur AI.

---

## Yang TIDAK termasuk usulan

- Tidak ada perubahan pada `agentGuard.ts` — penjagaan `.git`/`.env`/`*.pem`/
  `*.key` sudah benar dan teruji (harness P1–P6).
- Tidak ada perubahan pada `MAKS_BERKAS_GANTI` (200) atau pesannya — sudah
  benar dan teruji (`cargo test`).
- Tidak ada provider baru, endpoint baru, atau perintah Rust baru.

## Verifikasi yang masih BUTUH APP

- Menjalankan CodeMirror hidup: saran lokal muncul, Tab menerima, Escape
  menolak, dan tidak ada listener keydown global.
- End-to-end `replace_in_files` lewat UI: laporan memuat lokasi baris nyata.

Harness Node tidak menjalankan CodeMirror/Tauri; lihat §7 RANCANGAN.
